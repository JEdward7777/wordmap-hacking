import Token from './Token';

/**
 * Represents a set of zero or more tokens from a text.
 */
export default class Ngram {

    private tokens: Array<Token>;

    /**
     * @param {Array<Token>} tokens - a list of tokens of which this n-gram is componsed
     */
    constructor(tokens: Array<Token>) {
        this.tokens = tokens;
    }

    /**
     * Returns a human readable form of the n-gram.
     * @return {String}
     */
    public toString(): String {
        const tokenValues = [];
        for (const token of this.tokens) {
            tokenValues.push(token.toString());
        }
        return tokenValues.join(':');
    }
}
