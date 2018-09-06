export const Preprocessor = new class {
  public saneSerializeError = (e: Error, observed: WeakSet<{}>) => {
    if (observed.has(e)) {
      return "Cycle [Error Object]" as string;
    }
    observed.add(e);
    const keys = Object.keys(e) as Array<keyof typeof e>;
    const clone: {
      message: string;
      name: string;
      stack: string[];
    } = {} as any;
    keys.forEach(
      (k: keyof typeof e) =>
        (clone[k] = this.preprocessSpecificTypes(e[k], observed) as any),
    );
    if (e.message != null) {
      clone.message = e.message;
    }
    if (e.stack != null) {
      clone.stack = e.stack.split("\n").map((l) => l.trim());
    }
    if (e.name != null) {
      clone.name = e.name;
    }
    return clone;
  }

  public preprocessSpecificTypes = <
    T extends {} | Error | Buffer | RegExp | undefined | (() => void)
  >(
    meta: T,
    observed: WeakSet<{}>,
  ):
    | string
    | { name: string; message: string; stack: string[] }
    | { b64: string }
    | { buffer: string }
    | {
        ArraySample: {
          0: any;
          1: any;
          2: any;
          3: any;
          length: number;
          last: any;
        };
      }
    | any[]
    | {}
    | T => {
    if (meta instanceof Error) {
      return this.saneSerializeError(meta, observed);
    }
    if (Buffer.isBuffer(meta)) {
      if (meta.byteLength > 1024) {
        return { b64: `Buffer Size Too Large ${meta.byteLength} bytes` };
      }
      return { buffer: meta.toString("base64") };
    }
    if (meta instanceof RegExp) {
      return meta.toString();
    }
    if (meta instanceof Date) {
      return meta.toISOString();
    }
    if (Array.isArray(meta)) {
      if (meta.length > 4) {
        return {
          ArraySample: {
            last: this.preprocessSpecificTypes(meta[meta.length - 1], observed),
            length: meta.length,
            0: this.preprocessSpecificTypes(meta[0], observed),
            1: this.preprocessSpecificTypes(meta[0], observed),
            2: this.preprocessSpecificTypes(meta[0], observed),
            3: this.preprocessSpecificTypes(meta[0], observed),
          },
        };
      } else {
        return meta.map((el) => this.preprocessSpecificTypes(el, observed));
      }
    }
    if (typeof meta === "object") {
      return this.preprocess(meta, observed);
    }
    if (typeof meta === "function") {
      if (meta.name) {
        return `Function ${meta.name}`;
      }
      return "Function (Lambda)";
    }
    return meta;
  }

  public preprocess = <T extends any>(meta: T, observed?: WeakSet<{}>): any => {
    if (observed == null) {
      observed = new WeakSet();
    }
    if (typeof meta === "object" && meta !== null) {
      if (meta instanceof Error) {
        return this.preprocess({ error: meta }, observed);
      }
      if (observed.has(meta)) {
        return "Cycle [Object]";
      }
      observed.add(meta);
      const keys = Object.keys(meta);
      if (keys.length > 100) {
        meta.__keys = keys;
      }
      keys.forEach((k) => {
        meta[k] = this.preprocessSpecificTypes(
          meta[k],
          observed as WeakSet<{}>,
        );
      });
    }
    return meta;
  }
}();
