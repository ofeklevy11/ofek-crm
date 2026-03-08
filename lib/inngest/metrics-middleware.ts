import { InngestMiddleware } from "inngest";
import { inngestJobsTotal } from "@/lib/metrics";

export const metricsMiddleware = new InngestMiddleware({
  name: "Metrics Middleware",
  init() {
    return {
      onFunctionRun({ fn }) {
        return {
          finished({ result }) {
            const status = result.error ? "error" : "success";
            inngestJobsTotal.inc({ function_name: fn.name, status });
          },
        };
      },
    };
  },
});
