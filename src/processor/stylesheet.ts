const toPseudoJavascript = (source: string): string => {
  const lineCount = source === '' ? 0 : source.split('\n').length;

  return `${'\n'.repeat(lineCount)}export default null;\n`;
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
