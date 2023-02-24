import Lexer,{Token} from "wordmap-lexer";
import * as fs from "fs-extra";
import {Suggestion, Engine, Prediction} from "../";
import WordMap from "../";
import * as catboost from "catboost";
import * as map_without_alignment from './map_without_alignment';


//Greek to English
//const statistics_out_csv_filename = "./src/josh_test/results/map_with_catboost_stats_tenth_of_nt.csv";
//const catboost_save_filename = "./src/josh_test/results/tenth_of_nt.cbm";

//Greek to Chinese
const statistics_out_csv_filename = "./src/josh_test/results/map_with_catboost_stats_chinese.csv";
const catboost_save_filename = "./src/josh_test/results/tenth_of_nt_chinese.cbm";

export const catboostFeatureOrder : string[] = [
    "sourceCorpusPermutationsFrequencyRatio",
    "targetCorpusPermutationsFrequencyRatio",
    "sourceAlignmentMemoryFrequencyRatio",
    "targetAlignmentMemoryFrequencyRatio",
    "frequencyRatioCorpusFiltered",
    "frequencyRatioAlignmentMemoryFiltered",
    "sourceCorpusLemmaPermutationsFrequencyRatio",
    "targetCorpusLemmaPermutationsFrequencyRatio",
    "sourceAlignmentMemoryLemmaFrequencyRatio",
    "targetAlignmentMemoryLemmaFrequencyRatio",
    "lemmaFrequencyRatioCorpusFiltered",
    "lemmaFrequencyRatioAlignmentMemoryFiltered",
    "ngramRelativeTokenDistance",
    "alignmentRelativeOccurrence",
    "alignmentPosition",
    "phrasePlausibility",
    "lemmaPhrasePlausibility",
    "ngramLength",
    "characterLength",
    "alignmentOccurrences",
    "lemmaAlignmentOccurrences",
    "uniqueness",
    "lemmaUniqueness",
]

export function scores_to_catboost_features( scores: {[key:string]:number} ){
    const input_features_array = catboostFeatureOrder.map( (feature_name) => ( (scores[feature_name] === undefined)?0:scores[feature_name] ) );

    const empty_categorical_features = Array(input_features_array.length).fill(0);

    return [input_features_array,empty_categorical_features];
}

function catboost_score( map: WordMap, model: catboost.Model, predictions: Prediction[]): Prediction[] { 
    for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
        const [input_features_array,empty_categorical_features] = scores_to_catboost_features(predictions[prediction_i].getScores());
        const confidence = model.predict( [input_features_array], [empty_categorical_features] )[0];
        predictions[prediction_i].setScore("confidence", confidence);
    }
    //This is how non-catboost confidence calculation is done:
    // const results = Engine.calculateConfidence(
    //      predictions,
    //      (map as any).engine.alignmentMemoryIndex
    // );
    return Engine.sortPredictions(predictions);
}

function word_map_predict_tokens_catboost_style( m: WordMap, model : catboost.Model, from_tokens: Token[], to_tokens: Token[], maxSuggestions: number = 1, minConfidence: number = 0.01 ): Suggestion[]{
    const engine_run = (m as any).engine.run( from_tokens, to_tokens );
    const predictions = catboost_score( m, model, engine_run );
    const suggestions = Engine.suggest(predictions, maxSuggestions, (m as any).forceOccurrenceOrder, minConfidence);
    return suggestions;
}

if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );
    
    //load sentences and tokenize them.
    const source_sentence_tokens = map_without_alignment.load_tokens_from_tsv(map_without_alignment.source_tsv, true);
    const target_sentence_tokens = map_without_alignment.load_tokens_from_tsv(map_without_alignment.target_tsv);

    //Here I could inject the stringNumber and lemma and morph codes into the tokens.

    //figure out what sentence codes are common in both.
    let common_keys = Array.from(source_sentence_tokens.keys()).filter(key => target_sentence_tokens.has(key));


    //It wasn't working and I am thinking perhaps I am running out of memory so I will slice this.
    common_keys = common_keys.slice(0,common_keys.length*3/4);

    const source_sentence_tokens_array : Token[][] = common_keys.map( (key) => source_sentence_tokens.get(key) ) as Token[][]
    const target_sentence_tokens_array : Token[][] = common_keys.map( (key) => target_sentence_tokens.get(key) ) as Token[][]

    //now do the WordMap thingy.
    const map = map_without_alignment.load_corpus_into_wordmap( source_sentence_tokens_array, target_sentence_tokens_array );


    //load the manual mapping so we can score as we go along.
    const all_manual_mappings = JSON.parse(fs.readFileSync(map_without_alignment.remapped_filename, 'utf-8') );

    //hash the manual mappings by verse_id so we can look them up.
    const hashed_manual_mappings = new Map();
    for( let mapping_i = 0; mapping_i < all_manual_mappings.length; ++mapping_i ){
        const verse_id = all_manual_mappings[mapping_i].sourceNgram[0].id.slice(0,map_without_alignment.ID_VERSE_AFTER_END);
        if( !hashed_manual_mappings.has(verse_id) ) hashed_manual_mappings.set( verse_id, [] );
        hashed_manual_mappings.get(verse_id).push( all_manual_mappings[mapping_i] );
    }

    //const output_limit = 50;
    const output_limit = source_sentence_tokens_array.length; //no limit.

    //const csv_out = fs.createWriteStream( statistics_out_csv_filename, 'utf-8' );
    const csv_out_filehandle = fs.openSync(statistics_out_csv_filename, 'w');

    console.log( "verse num,verse id,num_manual_mappings,num_suggested_mappings,num_correct_mappings")
    //csv_out.write( "verse num,verse id,num_manual_mappings,num_suggested_mappings,num_correct_mappings\n" )
    fs.writeSync(csv_out_filehandle, "verse num,verse id,num_manual_mappings,num_suggested_mappings,num_correct_mappings\n" )

    //load the catboost model
    const model = new catboost.Model();
    model.loadModel(catboost_save_filename);

    //let all_suggestions: Suggestion[][] = [];
    for( let sentence_i = 0; sentence_i < Math.min(source_sentence_tokens_array.length, output_limit); ++sentence_i){
        const suggestions: Suggestion[] = word_map_predict_tokens_catboost_style( map, model, source_sentence_tokens_array[sentence_i], target_sentence_tokens_array[sentence_i] );
        //all_suggestions.push( suggestions );

        const manual_mappings = hashed_manual_mappings.get( common_keys[sentence_i] );

        const firstPredictions = suggestions[0].getPredictions();

        let num_correct_mappings = 0;
        for( let suggested_mapping_i = 0; suggested_mapping_i < firstPredictions.length; ++suggested_mapping_i ){
            mappingLoop: for( let manual_mapping_i = 0; manual_mapping_i < manual_mappings.length; ++manual_mapping_i ){
                const suggested_mapping = firstPredictions[suggested_mapping_i];
                const manual_mapping = manual_mappings[manual_mapping_i];

                const manual_mapping_source = manual_mapping.sourceNgram;
                const suggested_mapping_source = suggested_mapping.source.getTokens();
                const manual_mapping_target = manual_mapping.targetNgram;
                const suggested_mapping_target = suggested_mapping.target.getTokens();

                //see if the ngram on the suggestion are the same length
                if( manual_mapping_source.length != suggested_mapping_source.length ) continue mappingLoop;
                if( manual_mapping_target.length != suggested_mapping_target.length ) continue mappingLoop;

                //now check the source ngram is the same.
                for( let source_ngram_i = 0; source_ngram_i < manual_mapping_source.length; ++source_ngram_i ){
                    const manual_word = manual_mapping_source[source_ngram_i];
                    const suggested_word = suggested_mapping_source[source_ngram_i];

                    if( manual_word.text        != suggested_word.toString()  ) continue mappingLoop;
                    if( manual_word.occurrence  != suggested_word.occurrence  ) continue mappingLoop;
                    if( manual_word.occurrences != suggested_word.occurrences ) continue mappingLoop;
                }

                //and the target ngram.
                for( let target_ngram_i = 0; target_ngram_i < manual_mapping_target.length; ++target_ngram_i ){
                    const manual_word = manual_mapping_target[target_ngram_i];
                    const suggested_word = suggested_mapping_target[target_ngram_i];

                    if( manual_word.text        != suggested_word.toString()  ) continue mappingLoop;
                    if( manual_word.occurrence  != suggested_word.occurrence  ) continue mappingLoop;
                    if( manual_word.occurrences != suggested_word.occurrences ) continue mappingLoop;
                }

                num_correct_mappings++;
            }
        }
        console.log( `${sentence_i},${common_keys[sentence_i]},${manual_mappings.length},${firstPredictions.length},${num_correct_mappings}`)
        //csv_out.write( `${sentence_i},${common_keys[sentence_i]},${manual_mappings.length},${firstPredictions.length},${num_correct_mappings}\n` )
        fs.writeSync(csv_out_filehandle, `${sentence_i},${common_keys[sentence_i]},${manual_mappings.length},${firstPredictions.length},${num_correct_mappings}\n` )

        if( global.gc ){
            global.gc();
        }
    }
    //csv_out.end();


    //const result_as_json: String = JSON.stringify( all_suggestions, null, 2 );
    //fs.writeFileSync("map_without_alignment.json", result_as_json, 'utf8');


    console.log( "done" );
}