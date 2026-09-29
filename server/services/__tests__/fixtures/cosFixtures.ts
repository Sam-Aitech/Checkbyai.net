/**
 * Fixtures modelling real UK Home Office SMS Certificate of Sponsorship PDFs.
 *
 * Grounded in the SMS generation profile (see docs/FORENSIC_CORPUS.md):
 *   - Apache FOP Version 2.3 EXACTLY (checks 4/5/14/16 — version drift fails)
 *   - dc:language "x-unknown" — the FOP default (check 12; never en-GB)
 *   - Coherent generation instant: Info D:20250708205956Z ==
 *     XMP 2025-07-08T21:59:56Z (checks 15/17 compare instants, not strings)
 *   - 2 pages, Helvetica, text body inside the 300–700 word /
 *     3500–6000 character bands (checks 7–9)
 *   - DC values inside RDF containers (rdf:Seq / rdf:Bag), FOP's real shape
 *
 * These are stand-ins for pipeline development, not captured Home Office
 * PDFs — see data/forensic-corpus/v0/README.md.
 */

export const SMS_PRODUCER = 'Apache FOP Version 2.3';
export const SMS_ISO_DATE = '2025-07-08T21:59:56Z';
export const SMS_PDF_DATE = 'D:20250708215956Z';

/** XMP packet as Apache FOP actually emits it — DC values inside RDF containers. */
export const FOP_XMP_WITH_CONTAINERS = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:date><rdf:Seq><rdf:li>${SMS_ISO_DATE}</rdf:li></rdf:Seq></dc:date>
   <dc:format>application/pdf</dc:format>
   <dc:language><rdf:Bag><rdf:li>x-unknown</rdf:li></rdf:Bag></dc:language>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:PDFVersion>1.4</pdf:PDFVersion>
   <pdf:Producer>${SMS_PRODUCER}</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreateDate>${SMS_ISO_DATE}</xmp:CreateDate>
   <xmp:CreatorTool>${SMS_PRODUCER}</xmp:CreatorTool>
   <xmp:MetadataDate>${SMS_ISO_DATE}</xmp:MetadataDate>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

/** Same packet with DC values as bare text nodes (some FOP configurations). */
export const FOP_XMP_PLAIN = FOP_XMP_WITH_CONTAINERS
  .replace(
    `<dc:date><rdf:Seq><rdf:li>${SMS_ISO_DATE}</rdf:li></rdf:Seq></dc:date>`,
    `<dc:date>${SMS_ISO_DATE}</dc:date>`,
  )
  .replace(
    `<dc:language><rdf:Bag><rdf:li>x-unknown</rdf:li></rdf:Bag></dc:language>`,
    `<dc:language>x-unknown</dc:language>`,
  );

/**
 * One text line per CoS record row. 14 words / ~110 non-space characters:
 * 36 lines → ~504 words / ~3960 chars, mid-band for checks 8–9.
 * Plain ASCII words only — no parens, no backslashes (would break the
 * BT..ET string extraction the word counter reads).
 */
const TEXT_LINE =
  'CoS record sponsor licence migrant worker employment salary threshold occupation code resident labour market details';

function textStream(lineCount: number, startIndex: number): string {
  let ops = 'BT /F1 12 Tf 50 700 Td\n';
  for (let i = 0; i < lineCount; i++) {
    const n = String(startIndex + i).padStart(4, '0');
    ops += `(${TEXT_LINE} ${n}) Tj T*\n`;
  }
  ops += 'ET';
  const body = ops;
  return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
}

const INFO_DICT =
  `1 0 obj\n<< /Producer (${SMS_PRODUCER}) /Creator (${SMS_PRODUCER}) ` +
  `/CreationDate (${SMS_PDF_DATE}) /ModDate (${SMS_PDF_DATE}) /Title (Certificate of Sponsorship) >>\nendobj`;

const PAGES =
  `2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n` +
  `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>\nendobj\n` +
  `4 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>\nendobj\n` +
  `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n` +
  `6 0 obj\n${textStream(18, 1)}\nendobj\n` +
  `7 0 obj\n${textStream(18, 19)}\nendobj`;

/** A single-revision PDF: exactly one startxref. */
export const genuinePdfBinary = (xmp: string = FOP_XMP_WITH_CONTAINERS): string =>
  `%PDF-1.4\n${INFO_DICT}\n${PAGES}\n${xmp}\ntrailer\n<< /Root 2 0 R >>\nstartxref\n84100\n%%EOF\n`;

/**
 * A LINEARIZED ("fast web view") PDF. Two startxref tokens is the correct,
 * standard structure — the first-page xref plus the main one. The strict
 * SMS 17-gate does not judge revisions, so this is GENUINE here; revision
 * topology remains measured in the structural evidence layer.
 */
export const linearizedPdfBinary = (xmp: string = FOP_XMP_WITH_CONTAINERS): string =>
  `%PDF-1.4\n<< /Linearized 1 /L 84210 /O 4 /E 12000 /N 2 /T 84000 >>\n` +
  `startxref\n0\n%%EOF\n${INFO_DICT}\n${PAGES}\n${xmp}\ntrailer\n<< /Root 2 0 R >>\nstartxref\n84100\n%%EOF\n`;

/** A genuinely re-saved PDF: a true incremental update appended after %%EOF. */
export const incrementallyUpdatedPdfBinary = (): string =>
  `${genuinePdfBinary()}8 0 obj\n<< /Changed true >>\nendobj\ntrailer\n<< /Prev 84100 >>\nstartxref\n90500\n%%EOF\n`;
