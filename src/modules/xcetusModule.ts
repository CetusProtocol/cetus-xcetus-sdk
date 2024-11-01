import Decimal from "decimal.js";
import {
  buildNFT,
  CachedContent,
  cacheTime24h,
  cacheTime5min,
  CLOCK_ADDRESS,
  CoinAsset,
  d,
  extractStructTagFromType,
  getFutureTime,
  getMoveObjectType,
  getObjectFields,
  getObjectId,
  getPackagerConfigs,
  SuiAddressType,
  SuiObjectIdType,
  SuiResource,
  TransactionUtil,
} from "@cetusprotocol/cetus-sui-clmm-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { XCetusUtil } from "../utils/xcetus";
import {
  CancelRedeemParams,
  ConvertParams,
  DividendManager,
  DividendConfig,
  DividendsRouterModule,
  EXCHANGE_RATE_MULTIPER,
  LockCetus,
  RedeemLockParams,
  REDEEM_NUM_MULTIPER,
  VeNFT,
  VeNFTDividendInfo,
  XcetusConfig,
  XcetusManager,
  XcetusRouterModule,
  RedeemXcetusParams,
  LockUpManager,
  PhaseDividendInfo,
  BonusTypesV2,
} from "../types/xcetus_type";
import { CetusXcetusSDK } from "../sdk";
import { IModule } from "../interfaces/IModule";

/**
 * Helper class to help interact with xcetus with a router interface.
 */
export class XCetusModule implements IModule {
  protected _sdk: CetusXcetusSDK;

  private readonly _cache: Record<string, CachedContent> = {};

  constructor(sdk: CetusXcetusSDK) {
    this._sdk = sdk;
  }

  get sdk() {
    return this._sdk;
  }

  /**
   * Gets the VeNFT object for the specified account address.
   *
   * @param account_address The address of the account that owns the VeNFT object.
   * @param force_refresh Indicates whether to refresh the cache of the VeNFT object.
   * @returns A Promise that resolves to the VeNFT object or `undefined` if the object is not found.
   */
  async getOwnerVeNFT(
    account_address: SuiAddressType,
    force_refresh = true
  ): Promise<VeNFT | undefined> {
    const { xcetus } = this.sdk.sdkOptions;

    const cacheKey = `${account_address}_getLockUpManagerEvent`;
    const cacheData = this.getCache<VeNFT>(cacheKey, force_refresh);

    if (cacheData !== undefined) {
      return cacheData;
    }
    let veNFT: VeNFT | undefined;
    const filterType = `${xcetus.package_id}::xcetus::VeNFT`;
    const ownerRes: any = await this._sdk.fullClient.getOwnedObjectsByPage(
      account_address,
      {
        options: { showType: true, showContent: true, showDisplay: true },
        filter: { StructType: filterType },
      }
    );
    ownerRes.data.forEach((item: any) => {
      const type = extractStructTagFromType(
        getMoveObjectType(item) as string
      ).source_address;
      if (type === filterType) {
        if (item.data && item.data.content) {
          const { fields } = item.data.content;
          veNFT = {
            ...buildNFT(item),
            id: fields.id.id,
            index: fields.index,
            type,
            xcetus_balance: fields.xcetus_balance,
          };
          this.updateCache(cacheKey, veNFT, cacheTime24h);
        }
      }
    });

    return veNFT;
  }

  /**
   * Gets the list of LockCetus objects owned by the specified account address.
   *
   * @param account_address The address of the account that owns the LockCetus objects.
   * @returns A Promise that resolves to a list of LockCetus objects.
   */
  async getOwnerRedeemLockList(
    account_address: SuiAddressType
  ): Promise<LockCetus[]> {
    const { xcetus } = this.sdk.sdkOptions;
    const lockCetuss: LockCetus[] = [];

    const filterType = `${
      xcetus.package_id
    }::lock_coin::LockedCoin<${this.buileCetusCoinType()}>`;

    const ownerRes: any = await this._sdk.fullClient.getOwnedObjectsByPage(
      account_address,
      {
        options: { showType: true, showContent: true },
        filter: { StructType: filterType },
      }
    );
    for (const item of ownerRes.data) {
      const type = extractStructTagFromType(
        getMoveObjectType(item) as string
      ).source_address;

      if (type === filterType) {
        if (item.data) {
          const lockCetus = XCetusUtil.buildLockCetus(item.data.content);
          lockCetus.xcetus_amount = await this.getXCetusAmount(lockCetus.id);
          lockCetuss.push(lockCetus);
        }
      }
    }

    return lockCetuss;
  }

  /**
   * Gets the LockCetus object with the specified ID.
   *
   * @param lock_id The ID of the LockCetus object.
   * @returns A Promise that resolves to the LockCetus object or `undefined` if the object is not found.
   */
  async getLockCetus(lock_id: SuiObjectIdType): Promise<LockCetus | undefined> {
    const result = await this._sdk.fullClient.getObject({
      id: lock_id,
      options: { showType: true, showContent: true },
    });

    if (result.data?.content) {
      const lockCetus = XCetusUtil.buildLockCetus(result.data.content);
      lockCetus.xcetus_amount = await this.getXCetusAmount(lockCetus.id);
      return lockCetus;
    }
    return undefined;
  }

  /**
   * Gets the list of Cetus coins owned by the specified account address.
   *
   * @param account_address The address of the account that owns the Cetus coins.
   * @returns A Promise that resolves to a list of CoinAsset objects.
   */
  async getOwnerCetusCoins(
    account_address: SuiAddressType
  ): Promise<CoinAsset[]> {
    const coins = await this._sdk.getOwnerCoinAssets(
      account_address,
      this.buileCetusCoinType()
    );
    return coins;
  }

  /**
   * mint venft
   * @returns
   */
  mintVeNFTPayload(): Transaction {
    const { xcetus } = this.sdk.sdkOptions;

    const tx = new Transaction();

    tx.moveCall({
      target: `${xcetus.published_at}::${XcetusRouterModule}::mint_venft`,
      typeArguments: [],
      arguments: [tx.object(getPackagerConfigs(xcetus).xcetus_manager_id)],
    });

    return tx;
  }

  /**
   * Convert Cetus to Xcetus.
   * @param params
   * @returns
   */
  async convertPayload(
    params: ConvertParams,
    tx?: Transaction
  ): Promise<Transaction> {
    const { xcetus } = this.sdk.sdkOptions;
    tx = tx || new Transaction();
    const coin_type = this.buileCetusCoinType();

    if (this._sdk.senderAddress.length === 0) {
      throw Error("this config sdk senderAddress is empty");
    }

    const allCoins = await this._sdk.getOwnerCoinAssets(
      this._sdk.senderAddress,
      coin_type
    );
    const primaryCoinInputs: any = TransactionUtil.buildCoinForAmount(
      tx,
      allCoins,
      BigInt(params.amount),
      coin_type,
      true
    )!.targetCoin;

    if (params.venft_id === undefined) {
      tx.moveCall({
        target: `${xcetus.published_at}::${XcetusRouterModule}::mint_and_convert`,
        typeArguments: [],
        arguments: [
          tx.object(getPackagerConfigs(xcetus).lock_manager_id),
          tx.object(getPackagerConfigs(xcetus).xcetus_manager_id),
          primaryCoinInputs,
          tx.pure.u64(params.amount),
        ],
      });
    } else {
      tx.moveCall({
        target: `${xcetus.published_at}::${XcetusRouterModule}::convert`,
        typeArguments: [],
        arguments: [
          tx.object(getPackagerConfigs(xcetus).lock_manager_id),
          tx.object(getPackagerConfigs(xcetus).xcetus_manager_id),
          primaryCoinInputs,
          tx.pure.u64(params.amount),
          tx.object(params.venft_id),
        ],
      });
    }

    return tx;
  }

  /**
   * Convert Xcetus to Cetus, first step is to lock the Cetus for a period.
   * When the time is reach, cetus can be redeem and xcetus will be burned.
   * @param params
   * @returns
   */
  redeemLockPayload(params: RedeemLockParams): Transaction {
    const { xcetus } = this.sdk.sdkOptions;

    const tx = new Transaction();

    tx.moveCall({
      target: `${xcetus.published_at}::${XcetusRouterModule}::redeem_lock`,
      typeArguments: [],
      arguments: [
        tx.object(getPackagerConfigs(xcetus).lock_manager_id),
        tx.object(getPackagerConfigs(xcetus).xcetus_manager_id),
        tx.object(params.venft_id),
        tx.pure.u64(params.amount),
        tx.pure.u64(params.lock_day),
        tx.object(CLOCK_ADDRESS),
      ],
    });

    return tx;
  }

  /**
   * lock time is reach and the cetus can be redeemed, the xcetus will be burned.
   * @param params
   * @returns
   */
  redeemPayload(params: RedeemXcetusParams): Transaction {
    const { xcetus } = this.sdk.sdkOptions;

    const tx = new Transaction();

    tx.moveCall({
      target: `${xcetus.published_at}::${XcetusRouterModule}::redeem`,
      typeArguments: [],
      arguments: [
        tx.object(getPackagerConfigs(xcetus).lock_manager_id),
        tx.object(getPackagerConfigs(xcetus).xcetus_manager_id),
        tx.object(params.venft_id),
        tx.object(params.lock_id),
        tx.object(CLOCK_ADDRESS),
      ],
    });

    return tx;
  }

  redeemDividendPayload(
    venft_id: SuiObjectIdType,
    bonus_types: SuiAddressType[]
  ): Transaction {
    const { xcetus, xcetus_dividends } = this.sdk.sdkOptions;

    const tx = new Transaction();

    bonus_types.forEach((coin) => {
      tx.moveCall({
        target: `${xcetus.published_at}::${DividendsRouterModule}::redeem`,
        typeArguments: [coin],
        arguments: [
          tx.object(getPackagerConfigs(xcetus_dividends).dividend_manager_id),
          tx.object(venft_id),
        ],
      });
    });
    return tx;
  }

  redeemDividendV2Payload(
    venft_id: SuiObjectIdType,
    bonus_types: SuiAddressType[],
    x_token_type: SuiAddressType[]
  ): Transaction {
    const { xcetus_dividends } = this.sdk.sdkOptions;

    let tx = new Transaction();

    const xTokenTypeList = bonus_types.filter((coin) => {
      return x_token_type.includes(coin);
    });

    if (xTokenTypeList.length > 0) {
      tx = this.redeemDividendXTokenPayload(venft_id, tx);
    }

    bonus_types.forEach((coin) => {
      if (!x_token_type.includes(coin)) {
        tx.moveCall({
          target: `${xcetus_dividends.published_at}::${DividendsRouterModule}::redeem_v2`,
          typeArguments: [coin],
          arguments: [
            tx.object(getPackagerConfigs(xcetus_dividends).dividend_manager_id),
            tx.object(venft_id),
            tx.object(CLOCK_ADDRESS),
          ],
        });
      }
    });
    return tx;
  }

  redeemDividendV3Payload(
    venft_id: string,
    bonus_types: SuiAddressType[],
    bonus_types_v2: BonusTypesV2,
    x_token_type: SuiAddressType[]
  ): Transaction {
    const { xcetus_dividends } = this.sdk.sdkOptions;
    let tx = new Transaction();
    const xTokenTypeList = bonus_types.filter((coin) => {
      return x_token_type.includes(coin);
    });

    if (xTokenTypeList.length > 0) {
      tx = this.redeemDividendXTokenPayload(venft_id, tx);
    }

    bonus_types.forEach((coin: SuiAddressType) => {
      tx.moveCall({
        target: `${xcetus_dividends.published_at}::${DividendsRouterModule}::redeem_v3`,
        typeArguments: [coin],
        arguments: [
          tx.object(getPackagerConfigs(xcetus_dividends).dividend_manager_id),
          tx.object(getPackagerConfigs(xcetus_dividends).venft_dividends_id),
          tx.makeMoveVec({
            elements: bonus_types_v2[coin].map((index) => tx.pure.u64(index)),
            type: "u64",
          }),
          tx.object(venft_id),
          tx.object(CLOCK_ADDRESS),
        ],
      });
    });
    return tx;
  }

  redeemDividendXTokenPayload(
    venft_id: SuiObjectIdType,
    tx?: Transaction
  ): Transaction {
    const { xcetus_dividends, xcetus } = this.sdk.sdkOptions;
    const { xcetus_manager_id, lock_manager_id } = getPackagerConfigs(xcetus);
    const { dividend_manager_id } = getPackagerConfigs(xcetus_dividends);

    tx = tx === undefined ? new Transaction() : tx;

    tx.moveCall({
      target: `${xcetus_dividends.published_at}::${DividendsRouterModule}::redeem_xtoken`,
      typeArguments: [],
      arguments: [
        tx.object(lock_manager_id),
        tx.object(xcetus_manager_id),
        tx.object(dividend_manager_id),
        tx.object(venft_id),
        tx.object(CLOCK_ADDRESS),
      ],
    });
    return tx;
  }

  buileCetusCoinType(): SuiAddressType {
    return `${this.sdk.sdkOptions.cetus_faucet.package_id}::cetus::CETUS`;
  }

  buileXTokenCoinType(
    packageId = this._sdk.sdkOptions.xcetus.package_id,
    module = "xcetus",
    name = "XCETUS"
  ): SuiAddressType {
    return `${packageId}::${module}::${name}`;
  }

  /**
   * Cancel the redeem lock, the cetus locked will be return back to the manager and the xcetus will be available again.
   * @param params
   * @returns
   */
  cancelRedeemPayload(params: CancelRedeemParams): Transaction {
    const { xcetus } = this.sdk.sdkOptions;

    const tx = new Transaction();

    tx.moveCall({
      target: `${xcetus.published_at}::${XcetusRouterModule}::cancel_redeem_lock`,
      typeArguments: [],
      arguments: [
        tx.object(getPackagerConfigs(xcetus).lock_manager_id),
        tx.object(getPackagerConfigs(xcetus).xcetus_manager_id),
        tx.object(params.venft_id),
        tx.object(params.lock_id),
        tx.object(CLOCK_ADDRESS),
      ],
    });

    return tx;
  }

  /**
   * Gets the init factory event.
   *
   * @returns A Promise that resolves to the init factory event.
   */
  async getInitConfigs(): Promise<XcetusConfig> {
    const { package_id } = this.sdk.sdkOptions.xcetus;

    const cacheKey = `${package_id}_getInitFactoryEvent`;
    const cacheData = this.getCache<XcetusConfig>(cacheKey);

    if (cacheData !== undefined) {
      return cacheData;
    }

    const initEventObjects = (
      await this._sdk.fullClient.queryEventsByPage({
        MoveEventType: `${package_id}::xcetus::InitEvent`,
      })
    )?.data;

    const initEvent: XcetusConfig = {
      xcetus_manager_id: "",
      lock_manager_id: "",
      lock_handle_id: "",
    };

    if (initEventObjects.length > 0) {
      initEventObjects.forEach((item: any) => {
        const fields = item.parsedJson;
        if (fields) {
          initEvent.xcetus_manager_id = fields.xcetus_manager;
        }
      });
    }

    const lockEventObjects = (
      await this._sdk.fullClient.queryEventsByPage({
        MoveEventType: `${package_id}::locking::InitializeEvent`,
      })
    )?.data;
    if (lockEventObjects.length > 0) {
      lockEventObjects.forEach((item: any) => {
        const fields = item.parsedJson;
        if (fields) {
          initEvent.lock_manager_id = fields.lock_manager;
        }
      });
    }
    if (initEvent.lock_manager_id.length > 0) {
      initEvent.lock_handle_id = (
        await this.getLockUpManager(initEvent.lock_manager_id)
      ).lock_infos.lock_handle_id;
    }
    this.updateCache(cacheKey, initEvent, cacheTime24h);
    return initEvent;
  }

  /**
   * Gets the lock up manager event.
   *
   * @returns A Promise that resolves to the lock up manager event.
   */
  async getLockUpManager(
    lock_manager_id = getPackagerConfigs(this.sdk.sdkOptions.xcetus)
      .lock_manager_id,
    force_refresh = false
  ): Promise<LockUpManager> {
    const cacheKey = `${lock_manager_id}_getLockUpManager`;
    const cacheData = this.getCache<LockUpManager>(cacheKey, force_refresh);

    if (cacheData !== undefined) {
      return cacheData;
    }

    const lockObject = await this.sdk.fullClient.getObject({
      id: lock_manager_id,
      options: { showContent: true },
    });
    const info = XCetusUtil.buildLockUpManager(getObjectFields(lockObject));

    this.updateCache(cacheKey, info, cacheTime24h);
    return info;
  }

  /**
   * Gets the dividend manager event.
   *
   * @returns A Promise that resolves to the dividend manager event.
   */
  async getDividendConfigs(): Promise<DividendConfig> {
    const { package_id } = this.sdk.sdkOptions.xcetus_dividends;
    const { dividend_manager_id, venft_dividends_id } = getPackagerConfigs(
      this._sdk.sdkOptions.xcetus_dividends
    );

    const cacheKey = `${package_id}_getDividendManagerEvent`;
    const cacheData = this.getCache<DividendConfig>(cacheKey);

    if (cacheData !== undefined) {
      return cacheData;
    }

    const lockEventObjects = (
      await this._sdk.fullClient.queryEventsByPage({
        MoveEventType: `${package_id}::dividend::InitEvent`,
      })
    )?.data;

    const veNftDividendsObjects: any =
      await this._sdk.fullClient.getDynamicFieldObject({
        parentId: dividend_manager_id,
        name: {
          type: "0x1::string::String",
          value: "VeNFTDividends",
        },
      });

    const initEvent: DividendConfig = {
      dividend_manager_id: "",
      dividend_admin_id: "",
      dividend_settle_id: "",
      venft_dividends_id: "",
      venft_dividends_id_v2: "",
    };

    if (lockEventObjects.length > 0) {
      lockEventObjects.forEach((item: any) => {
        const fields = item.parsedJson;

        if (fields) {
          initEvent.dividend_manager_id = fields.manager_id;
          initEvent.dividend_admin_id = fields.admin_id;
          initEvent.dividend_settle_id = fields.settle_id;
          this.updateCache(cacheKey, initEvent, cacheTime24h);
        }
      });
    }
    if (
      veNftDividendsObjects &&
      veNftDividendsObjects.data &&
      veNftDividendsObjects.data.content
    ) {
      initEvent.venft_dividends_id =
        veNftDividendsObjects.data.content?.fields?.value;
      this.updateCache(cacheKey, initEvent, cacheTime24h);
    }

    const objects: any = await this._sdk.fullClient.getObject({
      id: venft_dividends_id,
      options: { showContent: true },
    });
    initEvent.venft_dividends_id_v2 =
      objects.data.content.fields.venft_dividends.fields.id.id;

    return initEvent;
  }

  /**
   * Gets the dividend manager object.
   *
   * @param force_refresh Whether to force a refresh of the cache.
   * @returns A Promise that resolves to the dividend manager object.
   */
  async getDividendManager(force_refresh = false): Promise<DividendManager> {
    const { dividend_manager_id } = getPackagerConfigs(
      this._sdk.sdkOptions.xcetus_dividends
    );

    const cacheKey = `${dividend_manager_id}_getDividendManager`;
    const cacheData = this.getCache<DividendManager>(cacheKey, force_refresh);

    if (cacheData !== undefined) {
      return cacheData;
    }
    const objects = await this._sdk.fullClient.getObject({
      id: dividend_manager_id,
      options: { showContent: true },
    });
    const fields = getObjectFields(objects);
    const dividendManager: DividendManager =
      XCetusUtil.buildDividendManager(fields);
    this.updateCache(cacheKey, dividendManager, cacheTime24h);
    return dividendManager;
  }

  /**
   * Gets the Xcetus manager object.
   *
   * @returns A Promise that resolves to the Xcetus manager object.
   */
  async getXcetusManager(force_refresh = true): Promise<XcetusManager> {
    const { xcetus_manager_id } = getPackagerConfigs(
      this._sdk.sdkOptions.xcetus
    );
    const cacheKey = `${xcetus_manager_id}_getXcetusManager`;
    const cacheData = this.getCache<XcetusManager>(cacheKey, force_refresh);

    if (cacheData) {
      return cacheData;
    }

    const result = await this._sdk.fullClient.getObject({
      id: xcetus_manager_id,
      options: { showContent: true },
    });
    const fields = getObjectFields(result);
    const xcetusManager: XcetusManager = {
      id: fields.id.id,
      index: Number(fields.index),
      has_venft: {
        handle: fields.has_venft.fields.id.id,
        size: fields.has_venft.fields.size,
      },
      nfts: {
        handle: fields.nfts.fields.id.id,
        size: fields.nfts.fields.size,
      },
      total_locked: fields.total_locked,
      treasury: fields.treasury.fields.total_supply.fields.value,
    };
    this.updateCache(cacheKey, xcetusManager);
    return xcetusManager;
  }

  /**
   * Gets the VeNFT dividend information for the specified VeNFT dividend handle and VeNFT ID.
   *
   * @param venft_dividends_handle The VeNFT dividend handle.
   * @param venft_id The VeNFT ID.
   * @returns A Promise that resolves to the VeNFT dividend information or undefined if an error occurs.
   */
  async getVeNFTDividendInfo(
    venft_dividends_handle: string,
    venft_dividends_handle_v2: string,
    venft_id: SuiObjectIdType
  ): Promise<VeNFTDividendInfo | undefined> {
    let venft_dividends: any;
    let veNFTDividendInfo: VeNFTDividendInfo = {
      id: "",
      ve_nft_id: venft_id,
      rewards: [],
    };
    try {
      venft_dividends = await this._sdk.fullClient.getDynamicFieldObject({
        parentId: venft_dividends_handle,
        name: {
          type: "0x2::object::ID",
          value: venft_id,
        },
      });
      const fields = getObjectFields(venft_dividends);
      veNFTDividendInfo = XCetusUtil.buildVeNFTDividendInfo(fields);
    } catch (error) {
      venft_dividends = undefined;
    }

    const rewards: any = [];
    try {
      const venft_dividends_v2 =
        await this._sdk.fullClient.getDynamicFieldObject({
          parentId: venft_dividends_handle_v2,
          name: {
            type: "0x2::object::ID",
            value: venft_id,
          },
        });
      const venft_table_id =
        getObjectFields(venft_dividends_v2).value.fields.value.fields.dividends
          .fields.id.id;
      let nextCursor: string | null = null;
      const limit = 50;
      const tableIdList: any = [];
      while (true) {
        const tableRes: any = await this._sdk.fullClient.getDynamicFields({
          parentId: venft_table_id,
          cursor: nextCursor,
          limit,
        });
        tableRes.data.forEach((item: any) => {
          tableIdList.push(item.objectId);
        });
        nextCursor = tableRes.nextCursor;
        if (nextCursor === null || tableRes.data.length < limit) {
          break;
        }
      }
      const objects: any = await this._sdk.fullClient.batchGetObjects(
        tableIdList,
        { showType: true, showContent: true }
      );

      objects.forEach((item: any) => {
        rewards.push({
          period: Number(item.data.content.fields.name),
          vesrion: "v2",
          rewards: item.data.content.fields.value.fields.contents.map(
            (ele: any) => {
              return {
                coin_type: extractStructTagFromType(ele.fields.key.fields.name)
                  .source_address,
                amount: ele.fields.value,
              };
            }
          ),
        });
      });
    } catch (error) {
      console.log(error);
    }

    return {
      ...veNFTDividendInfo,
      rewards: [...veNFTDividendInfo.rewards, ...rewards],
    };
  }

  /**
   * Calculates the redeem number for the specified amount and lock day.
   *
   * @param redeem_amount The amount to redeem.
   * @param lockDay The number of days to lock the amount for.
   * @returns A Promise that resolves to an object with the amount out and percent.
   */
  async redeemNum(
    redeem_amount: string | number,
    lock_day: number
  ): Promise<{ amount_out: string; percent: string }> {
    if (BigInt(redeem_amount) === BigInt(0)) {
      return { amount_out: "0", percent: "0" };
    }
    const lockUpManager = await this.getLockUpManager(
      getPackagerConfigs(this._sdk.sdkOptions.xcetus).lock_manager_id
    );

    const mid = d(REDEEM_NUM_MULTIPER)
      .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
      .mul(
        d(lockUpManager.max_percent_numerator).sub(
          d(lockUpManager.min_percent_numerator)
        )
      )
      .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));

    const percent = d(REDEEM_NUM_MULTIPER)
      .mul(d(lockUpManager.max_percent_numerator))
      .sub(mid)
      .div(d(EXCHANGE_RATE_MULTIPER))
      .div(REDEEM_NUM_MULTIPER);

    return {
      amount_out: d(percent).mul(d(redeem_amount)).round().toString(),
      percent: percent.toString(),
    };
  }

  /**
   * Reverses the redeem number for the specified amount and lock day.
   *
   * @param amount The amount to redeem.
   * @param lockDay The number of days to lock the amount for.
   * @returns A Promise that resolves to an object with the reversed amount and percent.
   */
  async reverseRedeemNum(
    amount: string | number,
    lock_day: number
  ): Promise<{ amount_out: string; percent: string }> {
    if (BigInt(amount) === BigInt(0)) {
      return { amount_out: "0", percent: "0" };
    }
    const lockUpManager = await this.getLockUpManager(
      getPackagerConfigs(this._sdk.sdkOptions.xcetus).lock_manager_id
    );

    const mid = d(REDEEM_NUM_MULTIPER)
      .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
      .mul(
        d(lockUpManager.max_percent_numerator).sub(
          d(lockUpManager.min_percent_numerator)
        )
      )
      .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));

    const percent = d(REDEEM_NUM_MULTIPER)
      .mul(d(lockUpManager.max_percent_numerator))
      .sub(mid)
      .div(d(EXCHANGE_RATE_MULTIPER))
      .div(REDEEM_NUM_MULTIPER);
    return {
      amount_out: d(amount).div(percent).toFixed(0, Decimal.ROUND_UP),
      percent: percent.toString(),
    };
  }

  /**
   * Gets the XCetus amount for the specified lock ID.
   *
   * @param lockId The ID of the lock.
   * @returns A Promise that resolves to the XCetus amount.
   */
  async getXCetusAmount(lock_id: string): Promise<string> {
    const { lock_handle_id } = getPackagerConfigs(this._sdk.sdkOptions.xcetus);

    const cacheKey = `${lock_id}_getXCetusAmount`;
    const cacheData = this.getCache<string>(cacheKey);

    if (cacheData !== undefined) {
      return cacheData;
    }

    try {
      const response = await this.sdk.fullClient.getDynamicFieldObject({
        parentId: lock_handle_id,
        name: {
          type: "0x2::object::ID",
          value: lock_id,
        },
      });
      const fields = getObjectFields(response);
      if (fields) {
        const { xcetus_amount } = fields.value.fields.value.fields;
        this.updateCache(cacheKey, xcetus_amount, cacheTime24h);
        return xcetus_amount;
      }
    } catch (error) {
      //
    }
    return "0";
  }

  /**
   * Gets the amount of XCetus and lock for the specified VENFT.
   *
   * @param nftHandleId The ID of the NFT handle.
   * @param veNftId The ID of the VENFT.
   * @returns A Promise that resolves to an object with the XCetus amount and lock amount.
   */
  async getVeNftAmount(
    nft_handle_id: string,
    ve_nft_id: string
  ): Promise<{ xcetus_amount: string; lock_amount: string }> {
    try {
      const response = await this.sdk.fullClient.getDynamicFieldObject({
        parentId: nft_handle_id,
        name: {
          type: "0x2::object::ID",
          value: ve_nft_id,
        },
      });
      const fields = getObjectFields(response);
      if (fields) {
        const { lock_amount, xcetus_amount } = fields.value.fields.value.fields;
        return { lock_amount, xcetus_amount };
      }
    } catch (error) {
      //
    }
    return { lock_amount: "0", xcetus_amount: "0" };
  }

  /**
   * @param phase_handle
   * @param phase
   * @param force_refresh
   * @returns
   */
  async getPhaseDividendInfo(
    phase: string,
    force_refresh = false
  ): Promise<PhaseDividendInfo | undefined> {
    const dividendManager = await this.getDividendManager();
    const phase_handle = dividendManager.dividends.id;
    const cacheKey = `${phase_handle}_${phase}_getPhaseDividendInfo`;
    const cacheData = this._sdk.getCache<PhaseDividendInfo>(
      cacheKey,
      force_refresh
    );

    if (cacheData) {
      return cacheData;
    }
    try {
      const res = await this._sdk.fullClient.getDynamicFieldObject({
        parentId: phase_handle,
        name: {
          type: "u64",
          value: phase,
        },
      });
      const fields = getObjectFields(res);
      const valueFields = fields.value.fields.value.fields;

      const redeemed_num = valueFields.redeemed_num.fields.contents.map(
        (item: any) => {
          return {
            name: item.fields.key.fields.name,
            value: item.fields.value,
          };
        }
      );

      const bonus_types = valueFields.bonus_types.map((item: any) => {
        return item.fields.name;
      });

      const bonus = valueFields.bonus.fields.contents.map((item: any) => {
        return {
          name: item.fields.key.fields.name,
          value: item.fields.value,
        };
      });

      const info: PhaseDividendInfo = {
        id: getObjectId(res),
        phase: fields.name,
        settled_num: valueFields.settled_num,
        register_time: valueFields.register_time,
        redeemed_num,
        is_settled: valueFields.is_settled,
        bonus_types,
        bonus,
        phase_end_time: "",
      };
      this.updateCache(cacheKey, info);
      return info;
    } catch (error) {}

    return undefined;
  }

  private updateCache(key: string, data: SuiResource, time = cacheTime5min) {
    let cacheData = this._cache[key];
    if (cacheData) {
      cacheData.overdueTime = getFutureTime(time);
      cacheData.value = data;
    } else {
      cacheData = new CachedContent(data, getFutureTime(time));
    }
    this._cache[key] = cacheData;
  }

  private getCache<T>(key: string, force_refresh = false): T | undefined {
    const cacheData = this._cache[key];
    if (!force_refresh && cacheData?.isValid()) {
      return cacheData.value as T;
    }
    delete this._cache[key];
    return undefined;
  }
}
