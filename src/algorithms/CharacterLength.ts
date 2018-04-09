import Algorithm from "../Algorithm";
import PermutationIndex from "../index/PermutationIndex";
import Prediction from "../structures/Prediction";

/**
 * Determines the likely hood that an n-gram is a phrase.
 */
export default class CharacterLength implements Algorithm {

  public name = "phrase plausibility";

  public execute(predictions: Prediction[], corpusIndex: PermutationIndex, savedAlignmentsIndex: PermutationIndex): Prediction[] {
    for (const p of predictions) {
      const sourceLength = p.alignment.source.characterLength;
      const targetLength = p.alignment.target.characterLength;
      const delta = Math.abs(sourceLength - targetLength);
      const longest = Math.max(sourceLength, targetLength);
      const weight = (longest - delta) / longest;
      p.setScore("characterLength", weight);
    }
    return predictions;
  }

}
