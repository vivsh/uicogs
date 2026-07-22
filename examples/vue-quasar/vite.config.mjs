export default {
  plugins: [sseFixture()],
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
};

function sseFixture() {
  let activeConnections = 0;
  return {
    name: "uicogs-sse-fixture",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === "/api/live-connections") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ active: activeConnections }));
          return;
        }
        if (request.url !== "/api/events/") {
          next();
          return;
        }
        activeConnections += 1;
        let active = true;
        const closed = () => {
          if (!active) return;
          active = false;
          activeConnections -= 1;
        };
        request.on("close", closed);
        response.on("close", closed);
        response.writeHead(200, {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        });
        response.flushHeaders();

        if (request.headers["last-event-id"] === "live-1") {
          response.write(
            'id: live-2\nevent: live-items\ndata: {"id":1,"title":"Reconnected live item"}\n\n',
          );
          response.write('id: live-3\nevent: live-items:delete\ndata: {"id":2}\n\n');
          return;
        }
        response.write(
          'id: live-1\nevent: live-items\ndata: {"id":1,"title":"Initial live item"}\n\n',
        );
        globalThis.setTimeout(() => response.end(), 30);
      });
    },
  };
}
