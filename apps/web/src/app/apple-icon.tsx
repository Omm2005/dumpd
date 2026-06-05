import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 42,
          background:
            "linear-gradient(160deg, #fbbf24 0%, #f97316 48%, #9a3412 100%)",
          color: "#fff7ed",
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: "-0.08em",
        }}
      >
        d
      </div>
    ),
    size,
  );
}
