declare module 'fast-xml-parser' {
  export interface X2jOptions {
    ignoreAttributes?: boolean
    attributeNamePrefix?: string
  }
  export class XMLParser {
    constructor(options?: X2jOptions)
    parse(xmlData: string): any
  }
}

