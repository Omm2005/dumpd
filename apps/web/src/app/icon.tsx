import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: 512,
  height: 512,
};

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, #f59e0b 0%, #f97316 42%, #c2410c 100%)",
          color: "#fff7ed",
          fontSize: 220,
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
