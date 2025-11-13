import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/api/getInviteLink",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    if (!employeeId) return new Response("Missing employeeId", { status: 400 });

    // Call the Convex query
    const result = await ctx.runQuery(api.people.getEmployeeInviteLink, {
      employeeId: employeeId as Id<"employees">,
    });
    if (!result) return new Response("No invite link", { status: 404 });

    return new Response(JSON.stringify({
      url: result.url,
      expiresAt: result.expiresAt,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
