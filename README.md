## xCETUS Docs

xCETUS
  Platform equity tokens are non-circulating currencies and cannot be transferred by default. They are recorded in the user's veNFT account in the form of points. How to obtain them:
  1) Convert 1 CETUS to 1 xCETUS Mint.
  2) LP NFT lock-up mining rewards released.
  xCETUS can be transferred under certain circumstances: to prevent special circumstances, only the platform has this permission.

veNFT
Store xCETUS in NFT (non-transferable) form under user account
Holding xCETUS can participate in cetus reward dividends, which will be distributed according to the proportion of the number of xCETUS in the wallet account veNFT to the total xCETUS in the market.


## xCETUS SDK - TS

Github Link: https://github.com/CetusProtocol/cetus-xcetus-sdk

NPM Link: [@cetusprotocol/cetus-xcetus-sdk](https://www.npmjs.com/package/@cetusprotocol/cetus-xcetus-sdk)

# features


### 1. mint VeNFT.
```
    sdk.XCetusModule.mintVeNFTPayload()

```

### 2. getOwnerVeNFT.
```
    const ownerVeNFT = await sdk.XCetusModule.getOwnerVeNFT(sendKeypair.getPublicKey().toSuiAddress())

    // ownerVeNFT
    {
        creator: 'Cetus',
        escription: "A non-transferrable NFT storing Cetus Escrowed Token xCETUS that represents a user's governance power on Cetus Protocol.",
        image_url: 'https://x77unmxbojk6nincdlzd57hhk5qgp5223rrrxrsplqqcs23vu5ja.arweave.net/v_9GsuFyVeahohryPvznV2Bn91rcYxvGT1wgKWt1p1I',
        link: 'https://app.cetus.zone',
        name: 'Cetus veNFT #14562',
        project_url: 'https://www.cetus.zone',
        id: '0x12adbc7e726cf2a5a9d4c4f0bdd08b6a49c876be99b2e650778a68d3891584bc',
        index: '14562',
        type: '0x9e69acc50ca03bc943c4f7c5304c2a6002d507b51c11913b247159c60422c606::xcetus::VeNFT',
        xcetus_balance: '1000000000'
    }

```

### 2. Convert Cetus to Xcetus

```
    sdk.XCetusModule.convertPayload({amount: '10000000000',venft_id})

```

### 3. redeemLock

```
    const lock_day = 15
    const amountInput = 20000
    const amount = await sdk.XCetusModule.redeemNum(amountInput, n)
    sdk.XCetusModule.redeemLockPayload({
      venft_id: venft_id,
      amount,
      lock_day,
    })

```

### 4. getOwnerRedeemLockList

```
    sdk.XCetusModule.getOwnerRedeemLockList(sendKeypair.getPublicKey().toSuiAddress())

    RedeemLockList:  [
      {
        id: '0x005ba9202a5d9e41c73155a1b4e473a0283191954fb47fe3f927c7026aefec40',
        type: '0x9e69acc50ca03bc943c4f7c5304c2a6002d507b51c11913b247159c60422c606::lock_coin::LockedCoin<0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS>',
        locked_start_time: 1730442744,
        locked_until_time: 1745994744,
        cetus_amount: '500000000',
        xcetus_amount: '500000000',
        lock_day: 180
      }
    ]

```

### 5. redeem

```
    const lock_id = '0x005ba9202a5d9e41c73155a1b4e473a0283191954fb47fe3f927c7026aefec40'
    const lockCetus = await sdk.XCetusModule.getLockCetus(lock_id)

    if (lockCetus && XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.redeemPayload({
        venft_id: venft_id,
        lock_id: lock_id,
      })
    }

 ```

### 6. cancelRedeemPayload

```
    const lock_id = '0x005ba9202a5d9e41c73155a1b4e473a0283191954fb47fe3f927c7026aefec40'
    const lockCetus = await sdk.XCetusModule.getLockCetus(lock_id)

    if (lockCetus && XCetusUtil.isLocked(lockCetus)) {
      const payload = sdk.XCetusModule.cancelRedeemPayload({
        venft_id: venft_id,
        lock_id: lock_id,
      })
    }

 ```

 ### 7. getVeNFTDividendInfo

 ```
    const { venft_dividends_id_v2 } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

    const dividendManager = await sdk.XCetusModule.getDividendManager()
    const veNFTDividendInfo = await sdk.XCetusModule.getVeNFTDividendInfo(
      dividendManager.venft_dividends.id,
      venft_dividends_id_v2,
      venft_id
    )

 ```

 ### 8. redeemDividendV3Payload

  ```
    const dividendManager = await sdk.XCetusModule.getDividendManager()
    const { venft_dividends_id_v2 } = getPackagerConfigs(sdk.sdkOptions.xcetus_dividends)

    const veNFTDividendInfo: any = await sdk.XCetusModule.getVeNFTDividendInfo(
      dividendManager.venft_dividends.id,
      venft_dividends_id_v2,
      venft_id
    )

    const bonus_types = XCetusUtil.buildDividendRewardTypeList(veNFTDividendInfo.rewards)
    const bonus_types_v2 = XCetusUtil.buildDividendRewardTypeListV2(veNFTDividendInfo.rewards)

    const phases: any = []
    veNFTDividendInfo.rewards.forEach((reward: any) => {
      if (reward.vesrion == 'v2') {
          phases.push(reward.period)
      }
    })
    await sdk.XCetusModule.redeemDividendV3Payload(phases, venft_id, bonus_types,bonus_types_v2, [
      sdk.XCetusModule.buileXTokenCoinType(),
    ])
 ```


