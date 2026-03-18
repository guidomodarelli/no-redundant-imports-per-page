const toPseudoJavascript = (source: string): string => {
  const lines = source.split('\n').map((line) => `//${line}`);

  return `${lines.join('\n')}\nexport default null;\n`;
};

export const stylesheetProcessor = {
  meta: {
    name: 'stylesheet',
  },
  preprocess(source: string): string[] {
    return [toPseudoJavascript(source)];
  },
  postprocess(messages: unknown[][]): unknown[] {
    return messages.flat();
  },
  supportsAutofix: false,
};

export { toPseudoJavascript };
