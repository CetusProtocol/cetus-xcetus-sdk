import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SDK } from './init_mainnet_sdk'
import { TestnetSDK } from './init_testnet_sdk'
import { CetusXcetusSDK } from '../../src/sdk'
import dotenv from 'dotenv';

const envConfig = dotenv.config();
export enum SdkEnv {
  mainnet = 'mainnet',
  testnet = 'testnet',
}
export let currSdkEnv = SdkEnv.mainnet

export function buildSdk(sdkEnv: SdkEnv = currSdkEnv): CetusXcetusSDK {
  currSdkEnv = sdkEnv
  switch (currSdkEnv) {
    case SdkEnv.mainnet:
      return SDK
    case SdkEnv.testnet:
      return TestnetSDK
    default:
      throw Error('not match SdkEnv')
  }
}


export function buildTestAccount(): Ed25519Keypair {
  // Please enter your test account secret or mnemonics
  const testAccountObject = Ed25519Keypair.deriveKeypair(envConfig?.parsed?.WALLET_KEY ||'')
  console.log(' Address: ', testAccountObject.getPublicKey().toSuiAddress())
  return testAccountObject
}


