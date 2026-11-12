/**
 * Embedded SCTs of a certificate (002/T057, research R5). `X509Certificate` does not list
 * extensions, so the DER is read with the ASN.1 schema of X.509. Only the extension embedded in
 * the certificate is checked: SCTs sent in the TLS extension or in a stapled OCSP response are
 * not, and the result never claims a full Certificate Transparency check.
 */
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { Certificate } from '@peculiar/asn1-x509';

/** RFC 6962 §3.3: SignedCertificateTimestampList. */
export const SCT_LIST_OID = '1.3.6.1.4.1.11129.2.4.2';

export type SctStatus = { status: 'embedded' | 'absent' | 'unknown'; count: number };

/** Never throws: a certificate that cannot be read gives `unknown`. */
export function readSct(der: Uint8Array | ArrayBuffer): SctStatus {
  try {
    const cert = AsnConvert.parse(der, Certificate);
    const extension = cert.tbsCertificate.extensions?.find((e) => e.extnID === SCT_LIST_OID);
    if (!extension) return { status: 'absent', count: 0 };
    // extnValue holds a DER OCTET STRING whose content is the TLS-encoded list.
    const list = new Uint8Array(AsnConvert.parse(extension.extnValue.buffer, OctetString).buffer);
    const total = ((list[0] ?? 0) << 8) | (list[1] ?? 0);
    if (total !== list.length - 2) return { status: 'unknown', count: 0 };
    let count = 0;
    for (let offset = 2; offset < list.length; count++) {
      const size = ((list[offset] ?? 0) << 8) | (list[offset + 1] ?? 0);
      offset += 2 + size;
      if (offset > list.length) return { status: 'unknown', count: 0 };
    }
    return count > 0 ? { status: 'embedded', count } : { status: 'absent', count: 0 };
  } catch {
    return { status: 'unknown', count: 0 };
  }
}
