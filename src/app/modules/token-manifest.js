import Token from '../types/token';

class TokenManifest {
  /**
   * @type {Object[]}
   * @private
   */
  _manifest = [];

  /**
   * Manifest tokens. Key is the token's ticker symbol.
   * @type {Map<string,Token>}
   * @private
   */
  _tokens = new Map();

  /**
   * Constructor. Fee info is required to associate fee data
   * with the token manifest data.
   * @param manifest {Object[]}
   * @param xbinfos {XBridgeInfo[]}
   */
  constructor(manifest, xbinfos) {
    this._manifest = manifest;
    const infos = new Map();
    for (const info of xbinfos)
      infos.set(info.ticker, info);
    for (const t of this._manifest) {
      const token = new Token(t);
      token.xbinfo = infos.get(token.ticker);
      this._tokens.set(token.ticker, token);
    }
  }

  /**
   * Returns the token for the specified ticker.
   * @param ticker {string}
   * @return Token
   */
  getToken(ticker) {
    if (!this._tokens.has(ticker))
      return null;
    return this._tokens.get(ticker);
  }

}

export default TokenManifest;
