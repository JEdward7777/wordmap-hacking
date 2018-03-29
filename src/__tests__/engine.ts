jest.mock("../DataIndex");
// @ts-ignore
import {mockAddAlignments} from "../DataIndex";
import Engine from "../Engine";
import NotImplemented from "../errors/NotImplemented";
import {alignSentence, MockAlgorithm, tokenizeSentence} from "./testUtils";

it("is not implemented", () => {
  const engine = new Engine();
  expect(engine.addCorpus).toThrow(NotImplemented);
});

it("registers an algorithm", () => {
  const engine = new Engine();
  const algorithm = new MockAlgorithm();
  engine.registerAlgorithm(algorithm);
  expect(engine.algorithms).toEqual([algorithm]);
});

it("adds the alignment to the index", () => {
  const sentence = alignSentence("Once upon a time");
  const engine = new Engine();
  engine.addAlignments(sentence);
  expect(mockAddAlignments).toBeCalledWith(sentence);
});

it("runs all the algorithms", () => {
  const algorithms = [
    new MockAlgorithm(),
    new MockAlgorithm()
  ];
  const spies = [];
  const engine = new Engine();
  for (const a of algorithms) {
    spies.push(jest.spyOn(a, "execute"));
    engine.registerAlgorithm(a);
  }
  const source = tokenizeSentence("Hello World");
  const target = tokenizeSentence("olleH dlroW");
  engine.run([source, target]);

  for (const s of spies) {
    expect(s).toHaveBeenCalled();
    s.mockReset();
    s.mockRestore();
  }
});