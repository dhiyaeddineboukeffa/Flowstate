const net = require("net");
const tls = require("tls");

const LOCAL_PORT = 27018;
const REMOTE_HOST = "ac-nc2ndin-shard-00-00.vx0fcge.mongodb.net";
const REMOTE_PORT = 27017;

const server = net.createServer((localSocket) => {
  const remoteSocket = tls.connect(
    {
      host: REMOTE_HOST,
      port: REMOTE_PORT,
      servername: REMOTE_HOST, // important for SNI
    },
    () => {
      localSocket.pipe(remoteSocket);
      remoteSocket.pipe(localSocket);
    }
  );

  remoteSocket.on("error", (err) => {
    console.error("Remote socket error:", err.message);
    localSocket.destroy();
  });

  localSocket.on("error", (err) => {
    console.error("Local socket error:", err.message);
    remoteSocket.destroy();
  });
});

server.listen(LOCAL_PORT, () => {
  console.log(`TCP proxy listening on localhost:${LOCAL_PORT} -> tls://${REMOTE_HOST}:${REMOTE_PORT}`);
});
