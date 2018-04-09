import Algorithm from "../Algorithm";
import Index from "../index/Index";
import NumberObject from "../index/NumberObject";
import PermutationIndex from "../index/PermutationIndex";
import Ngram from "../structures/Ngram";
import Prediction from "../structures/Prediction";

/**
 * This algorithm calculates the frequency of n-gram occurrences.
 */
export default class NgramFrequency implements Algorithm {

  /**
   * Counts how often an ngram appears in the index
   * @param {Index} index - the index to search
   * @param {Ngram} ngram - the ngram to count
   * @return {number}
   */
  private static countNgramFrequency(index: Index, ngram: Ngram): number {
    return index.readSum(ngram.key);
  }

  /**
   * Reads the alignment frequency from an index
   * @param {Index} index
   * @param {Ngram} sourceNgram
   * @param {Ngram} targetNgram
   * @return {number}
   */
  private static readAlignmentFrequency(index: Index, sourceNgram: Ngram, targetNgram: Ngram): number {
    const alignmentFrequency = index.read(
      sourceNgram.key,
      targetNgram.key
    );
    if (alignmentFrequency === undefined) {
      return 0;
    } else {
      return alignmentFrequency;
    }
  }

  /**
   * Performs a numerical addition with the value of a key in a number object.
   * TODO: move this into it's own class?
   *
   * @param {NumberObject} object
   * @param {string} key
   * @param {number} value
   */
  private static addObjectNumber(object: NumberObject, key: string, value: number) {
    if (!(key in object)) {
      object[key] = 0;
    }
    object[key] += value;
  }

  /**
   * Performs a numerical division.
   * Division by zero will result in 0.
   * TODO: move this into a math utility?
   *
   * @param {number} dividend
   * @param {number} divisor
   * @return {number}
   */
  private static divideSafe(dividend: number, divisor: number): number {
    if (divisor === 0) {
      return 0;
    } else {
      return dividend / divisor;
    }
  }

  public name: string = "n-gram frequency";

  public execute(predictions: Prediction[], corpusStore: PermutationIndex, savedAlignmentsStore: PermutationIndex): Prediction[] {
    const alignmentFrequencyCorpusSums: NumberObject = {};
    const alignmentFrequencySavedAlignmentsSums: NumberObject = {};

    for (const p  of predictions) {
      // frequency of this alignment in the possible predictions for corpus and saved alignments
      const alignmentFrequencyCorpus = corpusStore.alignmentFrequencyIndex.read(
        p.alignment);
      const alignmentFrequencySavedAlignments = savedAlignmentsStore.alignmentFrequencyIndex.read(
        p.alignment);

      // source and target n-gram frequency in the alignment permutations,
      // TODO: this can be red from secondaryNgramFrequencyIndexStore (needs better name)
      // This is the same as primaryCorpusFrequency in the documentation.
      // Total number of possible alignments against the n-gram in the entire corpus.
      const ngramFrequencyCorpusSource = corpusStore.sourceNgramFrequencyIndex.read(
        p.alignment.source);
      const ngramFrequencySavedAlignmentsSource = savedAlignmentsStore.sourceNgramFrequencyIndex.read(
        p.alignment.source);
      const ngramFrequencyCorpusTarget = corpusStore.targetNgramFrequencyIndex.read(
        p.alignment.target);
      const ngramFrequencySavedAlignmentsTarget = savedAlignmentsStore.targetNgramFrequencyIndex.read(
        p.alignment.target);

      // TODO: get n-gram frequency for the corpus and saved alignments (not the permuations)
      // sentenceNgrams = readNgram(sentence, ngram.length);
      // ["hello", "world"]
      // {
      //  "hello": 1
      // }
      // We still need to index this data.
      // we won't need this until we are calculating commonality and uniqueness.

      // source and target frequency ratio for the corpus and saved alignments
      const frequencyRatioCorpusSource: number = NgramFrequency.divideSafe(
        alignmentFrequencyCorpus,
        ngramFrequencyCorpusSource
      );
      const frequencyRatioCorpusTarget: number = NgramFrequency.divideSafe(
        alignmentFrequencyCorpus,
        ngramFrequencyCorpusTarget
      );
      const frequencyRatioSavedAlignmentsSource: number = NgramFrequency.divideSafe(
        alignmentFrequencySavedAlignments,
        ngramFrequencySavedAlignmentsSource
      );
      const frequencyRatioSavedAlignmentsTarget: number = NgramFrequency.divideSafe(
        alignmentFrequencySavedAlignments,
        ngramFrequencySavedAlignmentsTarget
      );

      // store scores
      p.setScores({
        alignmentFrequencyCorpus,
        alignmentFrequencySavedAlignments,

        ngramFrequencyCorpusSource,
        ngramFrequencyCorpusTarget,
        ngramFrequencySavedAlignmentsSource,
        ngramFrequencySavedAlignmentsTarget,

        frequencyRatioCorpusSource,
        frequencyRatioCorpusTarget,
        frequencyRatioSavedAlignmentsSource,
        frequencyRatioSavedAlignmentsTarget
      });

      // TODO: I think we need to include the frequency scores for the unaligned sentence as well.
      // the predictions is built on this so we can sum these in this loop and inject them
      // in the filter loop below

      // sum alignment frequencies
      NgramFrequency.addObjectNumber(
        alignmentFrequencyCorpusSums,
        p.key,
        alignmentFrequencyCorpus
      );
      NgramFrequency.addObjectNumber(
        alignmentFrequencySavedAlignmentsSums,
        p.key,
        alignmentFrequencySavedAlignments
      );
    }

    // calculate filtered frequency ratios
    for (const p of predictions) {
      const alignmentFrequencyCorpus = p.getScore("alignmentFrequencyCorpus");
      const alignmentFrequencySavedAlignments = p.getScore(
        "alignmentFrequencySavedAlignments");

      // TODO: is this correct terminology?
      // TODO: we are missing something here.

      // alignment frequency in the filtered corpus and saved alignments
      const alignmentFrequencyCorpusFiltered = alignmentFrequencyCorpusSums[p.key];
      const alignmentFrequencySavedAlignmentsFiltered = alignmentFrequencySavedAlignmentsSums[p.key];

      // source and target frequency ratio for the corpus and saved alignments
      const frequencyRatioCorpusSourceFiltered: number = NgramFrequency.divideSafe(
        alignmentFrequencyCorpus,
        alignmentFrequencyCorpusFiltered
      );
      const frequencyRatioSavedAlignmentsFiltered: number = NgramFrequency.divideSafe(
        alignmentFrequencySavedAlignments,
        alignmentFrequencySavedAlignmentsFiltered
      );

      // store scores
      p.setScores({
        alignmentFrequencyCorpusFiltered,
        alignmentFrequencySavedAlignmentsFiltered,

        frequencyRatioCorpusSourceFiltered,
        frequencyRatioSavedAlignmentsFiltered
      });
    }

    return predictions;
  }

}
