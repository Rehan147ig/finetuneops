declare module "autocannon" {
  export type Result = {
    requests: {
      average: number;
    };
    latency: {
      p99: number;
    };
  };

  export type Instance = {
    on(event: "error", listener: (error: Error) => void): void;
  };

  export type Options = {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    connections?: number;
    duration?: number;
  };

  export type Callback = (error: Error | null, result: Result) => void;

  export default function autocannon(
    options: Options,
    callback?: Callback,
  ): Instance;
}
