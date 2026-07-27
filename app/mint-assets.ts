export const MINT_ASSET_ROOT = "/assets/mint";

export type MintBookAsset = {
  id: string;
  file: string;
};

export type MintAssetManifest = {
  manifestVersion: number;
  generatedAt: string;
  collection: string;
  assets: MintBookAsset[];
};
