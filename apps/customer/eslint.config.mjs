import next from "eslint-config-next/core-web-vitals";

const config = [...next, { ignores: ["public/mockServiceWorker.js"] }];
export default config;
