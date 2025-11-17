declare module 'street-suffix' {
  export interface StreetSuffix {
    expand: (input: string) => string | undefined;
    abbreviate: (input: string) => string | undefined;
  }

  const streetSuffix: StreetSuffix;
  export = streetSuffix;
}


