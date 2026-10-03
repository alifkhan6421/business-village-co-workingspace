// Local stand-in for the Resend API used by the automated tests
// (EMAIL_API_BASE_URL=http://127.0.0.1:4010). Records every email so tests
// can assert on recipients, subjects, language and links.
import http from "node:http";

const emails = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/emails") {
      const payload = JSON.parse(body || "{}");
      const id = `mock_${emails.length + 1}`;
      emails.push({ id, ...payload, receivedAt: new Date().toISOString() });
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ id }));
    }
    if (req.method === "GET" && req.url === "/emails") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(emails));
    }
    if (req.method === "DELETE" && req.url === "/emails") {
      emails.length = 0;
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
});
server.listen(Number(process.env.PORT ?? 4010), "127.0.0.1", () => console.log("mock email server on 4010"));
