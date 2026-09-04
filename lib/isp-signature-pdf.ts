import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ISPSignatureError, type ISPSignatureDraft } from "./isp-signatures";

export type SignatureField = {
  identifier: number;
  type: "SIGNATURE" | "DATE";
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

/** One immutable PDF, with dedicated signature pages so fields never cover plan text. */
export async function createISPSignaturePDF(
  draft: ISPSignatureDraft,
  residentName: string,
  packetId: string,
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(draft.title);
  pdf.setCreator("El Elyon");
  let page = pdf.addPage([612, 792]);
  let y = 736;
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 736;
  }
  function paragraph(text: string, heading = false) {
    const face = heading ? bold : font;
    const size = heading ? 13 : 11;
    try {
      face.encodeText(text.replace(/[\r\n\t]/g, " "));
    } catch {
      throw new ISPSignatureError(
        "The PDF font cannot display a character in this plan. Replace unsupported symbols or characters before saving.",
      );
    }
    for (const block of text.replace(/\t/g, "    ").split(/\r?\n/)) {
      let line = "";
      // Wrap at words where possible; split long unbroken words without truncation.
      for (const word of block.split(" ")) {
        if (line && face.widthOfTextAtSize(line + " " + word, size) > 504) {
          draw(line);
          line = "";
        }
        for (const char of (line ? " " : "") + word) {
          if (face.widthOfTextAtSize(line + char, size) > 504) {
            draw(line);
            line = "";
          }
          line += char;
        }
      }
      draw(line);
    }
    y -= 8;
    function draw(line: string) {
      if (y < 64) newPage();
      page.drawText(line, { x: 54, y, size, font: face });
      y -= 17;
    }
  }
  paragraph("Individual Service Plan", true);
  paragraph(draft.title, true);
  paragraph(
    `Resident: ${residentName}\nVersion: ${draft.versionLabel}\nEffective date: ${draft.effectiveDate}\nPrepared by: ${draft.preparedBy}`,
  );
  paragraph("Plan and supports", true);
  paragraph(draft.content);
  paragraph("Goals and outcomes", true);
  draft.goals.forEach((goal, i) => paragraph(`${i + 1}. ${goal}`));
  const fields: SignatureField[][] = [];
  draft.signers.forEach((signer, i) => {
    if (i % 4 === 0) {
      newPage();
      paragraph("Signatures", true);
      paragraph(
        "Please review the entire plan before signing. Your signature and signing date will be recorded below.",
      );
    }
    const top = 150 + (i % 4) * 140;
    const label = `${signer.name} - ${signer.role}`;
    try {
      font.encodeText(label);
      font.encodeText(signer.email);
    } catch {
      throw new ISPSignatureError(
        "A signer name or role contains characters the PDF font cannot display. Replace unsupported characters before saving.",
      );
    }
    page.drawText(label, {
      x: 54,
      y: 792 - top,
      size: Math.min(11, 504 / font.widthOfTextAtSize(label, 1)),
      font,
    });
    page.drawText(signer.email, {
      x: 54,
      y: 792 - top - 20,
      size: Math.min(10, 504 / font.widthOfTextAtSize(signer.email, 1)),
      font,
    });
    const fieldY = top + 48;
    page.drawRectangle({
      x: 54,
      y: 792 - fieldY - 38,
      width: 290,
      height: 38,
      borderWidth: 0.5,
      borderColor: rgb(0.65, 0.65, 0.65),
    });
    page.drawText("Signature", { x: 54, y: 792 - fieldY - 52, size: 9, font });
    page.drawText("Date signed", {
      x: 382,
      y: 792 - fieldY - 52,
      size: 9,
      font,
    });
    fields.push([
      {
        identifier: 0,
        type: "SIGNATURE",
        page: pdf.getPageCount(),
        positionX: (54 / 612) * 100,
        positionY: (fieldY / 792) * 100,
        width: (290 / 612) * 100,
        height: (38 / 792) * 100,
      },
      {
        identifier: 0,
        type: "DATE",
        page: pdf.getPageCount(),
        positionX: (382 / 612) * 100,
        positionY: (fieldY / 792) * 100,
        width: (170 / 612) * 100,
        height: (38 / 792) * 100,
      },
    ]);
  });
  pdf
    .getPages()
    .forEach((p, i) =>
      p.drawText(`ISP ${packetId} | Page ${i + 1} of ${pdf.getPageCount()}`, {
        x: 54,
        y: 30,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      }),
    );
  return { bytes: await pdf.save(), fields };
}
