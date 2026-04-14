import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const redirectTo = new URL("/", request.url);
  const response = NextResponse.redirect(redirectTo);
  response.cookies.set("lab_role", "", {
    expires: new Date(0),
    path: "/",
  });
  return response;
}
