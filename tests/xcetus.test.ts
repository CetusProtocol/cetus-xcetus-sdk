import { buildSdk, buildTestAccount } from './data/init_test_data'
import 'isomorphic-fetch'
import { XCetusUtil } from '../src/utils/xcetus'
import { d, getPackagerConfigs, printTransaction } from '@cetusprotocol/cetus-sui-clmm-sdk'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

let sendKeypair: Ed25519Keypair

const venft_id = '0x653edd0c372ee7b5fc38e7934caab30b8a45b1680d727f127b05140806034067'

describe('xcetus Module', () => {
  const sdk = buildSdk()

  beforeEach(async () => {
    sendKeypair = buildTestAccount()
  })

  

  test('getLockUpManagerEvent', async () => {
    const lockUpManagerEvent = await sdk.XCetusModule.getLockUpManager()
    console.log(lockUpManagerEvent)
  })

  test('mintVeNFTPayload', async () => {
    const payload = sdk.XCetusModule.mintVeNFTPayload()
    const tx = await sdk.fullClient.sendTransaction(sendKeypair, payload)
    console.log('mintVeNFTPayload : ', tx)
  })

  test('getOwnerVeNFT', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT('0x3992ecfe4eca00d482210cddfceb063608f45f3ca41ce7eedea33f27870eb55a')
    console.log('ownerVeNFT: ', ownerVeNFT)
  })

  test('getOwnerCetusCoins', async () => {
    const coins = await sdk.XCetusModule.getOwnerCetusCoins(sendKeypair.getPublicKey().toSuiAddress())
    console.log('coins: ', coins)
  })

  test('Convert Cetus to Xcetus', async () => {
    sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
    const payload = await sdk.XCetusModule.convertPayload({
      amount: '10000000000',
      venft_id,
    })

    printTransaction(payload)

    const tx = await sdk.fullClient.sendTransaction(sendKeypair, payload)
    console.log('convertPayload : ', tx)
  })

  test('redeemNum', async () => {
    const n = 15
    const amountInput = 20000
    const amount = await sdk.XCetusModule.redeemNum(amountInput, n)
    const rate = d(n).sub(15).div(165).mul(0.5).add(0.5)
    const amount1 = rate.mul(amountInput)
    console.log('amount : ', amount, amount1, rate)
  })

  test('redeemLockPayload', async () => {
    const payload = sdk.XCetusModule.redeemLockPayload({
      venft_id: venft_id,
      amount: '1000',
      lock_day: 30,
    })

    const tx = await sdk.fullClient.sendTransaction(sendKeypair, payload)
    console.log('redeemLockPayload : ', tx)
  })

  test('getOwnerRedeemLockList', async () => {
    const lockCetuss = await sdk.XCetusModule.getOwnerRedeemLockList('0x3992ecfe4eca00d482210cddfceb063608f45f3ca41ce7eedea33f27870eb55a')
    console.log('lockCetuss: ', lockCetuss)
  })

  test('getLockCetus', async () => {
    const lockCetus = await sdk.XCetusModule.getLockCetus('0x005ba9202a5d9e41c73155a1b4e473a0283191954fb47fe3f927c7026aefec40')
    console.log('lockCetus: ', lockCetus)
  })

  test('redeemPayload', async () => {
    const lock_id = '0x6c7cb48929308e7213747c0710ea38db89e3067aa7c80645a0b41dca596fa375'
    const lockCetus = await sdk.XCetusModule.getLockCetus(lock_id)
    console.log('lockCetus: ', lockCetus)

    if (lockCetus && !XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.redeemPayload({
        venft_id: venft_id,
        lock_id: lock_id,
      })

      const tx = await sdk.fullClient.sendTransaction(sendKeypair, payload)
      console.log('redeemPayload : ', tx)
    } else {
      console.log(' not reach  lock time')
    }
  })

  test('cancelRedeemPayload', async () => {
    const lock_id = '0x6c7cb48929308e7213747c0710ea38db89e3067aa7c80645a0b41dca596fa375'
    const lockCetus = await sdk.XCetusModule.getLockCetus(lock_id)
    console.log('lockCetus: ', lockCetus)

    if (lockCetus && XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.cancelRedeemPayload({
        venft_id: venft_id,
        lock_id: lock_id,
      })

      const tx = await sdk.fullClient.sendTransaction(sendKeypair, payload)
      console.log('cancelRedeemPayload : ', tx)
    }
  })

  test('getXcetusManager', async () => {
    const xcetusManager = await sdk.XCetusModule.getXcetusManager()
    console.log('xcetusManager: ', xcetusManager)
  })

  /**-------------------------------------xWHALE Holder Rewards--------------------------------------- */
  test('get my share', async () => {
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(sendKeypair.getPublicKey().toSuiAddress())
    console.log('ownerVeNFT: ', ownerVeNFT)

    if (ownerVeNFT) {
      const xcetusManager = await sdk.XCetusModule.getXcetusManager()
      console.log('xcetusManager: ', xcetusManager)

      const veNftAmount = await sdk.XCetusModule.getVeNftAmount(xcetusManager.nfts.handle, ownerVeNFT.id)
      console.log('veNftAmount: ', veNftAmount)

      const rate = d(ownerVeNFT.xcetus_balance).div(xcetusManager.treasury)
      console.log('rate: ', rate)
    }
  })

  test('getNextStartTime', async () => {
    const dividendManager = await sdk.XCetusModule.getDividendManager()
    console.log('dividendManager: ', dividendManager)

    const nextTime = XCetusUtil.getNextStartTime(dividendManager)

    console.log('nextTime: ', nextTime)
  })

  test('getVeNFTDividendInfo', async () => {
    const { venft_dividends_id_v2 } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

    const dividendManager = await sdk.XCetusModule.getDividendManager()
    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(
      dividendManager.venft_dividends.id,
      venft_dividends_id_v2,
      venft_id
    )
    console.log('🚀🚀🚀 ~ file: xcetus.test.ts:175 ~ test ~ veNFTDividendInfo:', JSON.stringify(veNFTDividendInfo, null, 2))
  })

  test('getPhaseDividendInfo', async () => {
    const phaseDividendInfo = await sdk.XCetusModule.getPhaseDividendInfo('10')
    console.log('phaseDividendInfo: ', phaseDividendInfo)
  })

  // test('redeemDividendPayload', async () => {
  //   const dividendManager = await sdk.XCetusModule.getDividendManager()
  //   const { venft_dividends_id } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

  //   const veNFTDividendInfo =  await sdk.XCetusModule.getVeNFTDividendInfo(dividendManager.venft_dividends.id venft_dividends_id, venft_id)
  //   if(veNFTDividendInfo){
  //     const bonus_types = XCetusUtil.buildDividendRewardTypeList(veNFTDividendInfo)
  //     console.log("bonus_types: ", bonus_types);

  //     const payload =  sdk.XCetusModule.redeemDividendV2Payload(venft_id, bonus_types,[sdk.XCetusModule.buileXTokenCoinType()])

  //     printTransaction(payload)
  //     const result = await sdk.ClmmSDK.fullClient.sendTransaction(sendKeypair , payload)
  //     console.log("redeemDividendPayload: ",result);

  //   }
  // })

  test('redeemDividendV3Payload', async () => {
    const dividendManager = await sdk.XCetusModule.getDividendManager()
    const { venft_dividends_id_v2 } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

    const veNFTDividendInfo: any = await sdk.XCetusModule.getVeNFTDividendInfo(
      dividendManager.venft_dividends.id,
      venft_dividends_id_v2,
      venft_id
    )

    if (veNFTDividendInfo) {
      const bonus_types = XCetusUtil.buildDividendRewardTypeList(veNFTDividendInfo.rewards)
      const bonus_types_v2 = XCetusUtil.buildDividendRewardTypeListV2(veNFTDividendInfo.rewards)

     
      const payload = await sdk.XCetusModule.redeemDividendV3Payload(venft_id, bonus_types,bonus_types_v2, [
        sdk.XCetusModule.buileXTokenCoinType(),
      ])
      printTransaction(payload)
      try {
        const res = await sdk.fullClient.devInspectTransactionBlock({ transactionBlock: payload, sender: sendKeypair.toSuiAddress() })
        // const result = await sdk.ClmmSDK.fullClient.sendTransaction(sendKeypair, payload)
        // console.log('redeemDividendV3Payload: ', result)
      } catch (error) {
        console.log('🚀🚀🚀 ~ file: xcetus.test.ts:216 ~ test ~ error:', error)
      }
    }
  })
})
