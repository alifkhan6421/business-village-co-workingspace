import Link from "next/link";
import "./globals.css";

export default function RootNotFound() {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui", textAlign: "center", padding: "6rem 1rem" }}>
        <h1>404</h1>
        <p>
          <Link href="/de">Zur Startseite</Link> · <Link href="/en">Go to homepage</Link>
        </p>
      </body>
    </html>
  );
}
