import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  try {
    // Generate temporary token using v3 streaming API
    // Max expiration is 600 seconds (10 minutes)
    const response = await fetch(
      "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
      {
        method: "GET",
        headers: {
          Authorization: apiKey,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("v3 token generation failed:", response.status, errorText);
      throw new Error(`Token generation failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("✓ Token generated successfully (expires in 10 minutes)");
    return NextResponse.json({ token: data.token });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate token",
      },
      { status: 500 },
    );
  }
}
