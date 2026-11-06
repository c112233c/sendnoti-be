function normalizeIp(address) {
  if (typeof address !== "string") return "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function ipv4ToInt(address) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result >>> 0;
}

function matchesCidr(address, cidr) {
  const [rawNetwork, rawPrefix] = cidr.split("/");
  const ip = normalizeIp(address);
  const network = normalizeIp(rawNetwork);
  const ipInt = ipv4ToInt(ip);
  const networkInt = ipv4ToInt(network);

  if (ipInt === null || networkInt === null) {
    return ip.toLowerCase() === network.toLowerCase() &&
      (rawPrefix === undefined || rawPrefix === "128");
  }
  const prefix = rawPrefix === undefined ? 32 : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((networkInt & mask) >>> 0);
}

export function isTrustedAddress(address, trustedNetworks) {
  if (!address || !Array.isArray(trustedNetworks)) return false;
  return trustedNetworks.some((cidr) => matchesCidr(address, cidr.trim()));
}
