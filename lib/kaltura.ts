export function extractKalturaId(assetId: string): string | null {
  if (!assetId) return null;

  let match = assetId.match(/\(([^)]+)\)/);
  if (match) return match[1];

  match = assetId.match(/\/id\/([^/]+)/);
  if (match) return match[1];

  if (/^1_[a-z0-9]+$/i.test(assetId)) {
    return assetId;
  }

  match = assetId.match(/\/k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }

  match = assetId.match(/^k1(\w+)$/);
  if (match) {
    return `1_${match[1]}`;
  }

  match = assetId.match(/k1([a-z0-9])\/k1([a-z0-9]+)/i);
  if (match) {
    return `1_${match[2]}`;
  }

  match = assetId.match(/k1(\d+)\/k1(.+)/i);
  if (match) {
    return `1_${match[2]}`;
  }

  return null;
}
