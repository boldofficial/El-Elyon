import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AccessDeniedError } from "@/lib/db-helpers";
import { ISPSignatureError } from "@/lib/isp-signatures";

export function signatureError(error: unknown) {
  if (error instanceof ISPSignatureError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof AccessDeniedError)
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      {
        error:
          "Check the plan, date, goals, and signer details. Every signer needs a unique valid email address.",
      },
      { status: 400 },
    );
  // Do not log request content, provider responses, signing links, or resident information.
  console.error(
    "ISP signature operation failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    {
      error:
        "Unable to complete this ISP action. Please refresh and try again.",
    },
    { status: 500 },
  );
}

export function privateJSON(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
