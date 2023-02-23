import Lexer,{Token} from "wordmap-lexer";
import * as fs from "fs-extra";
import {Suggestion, Engine, Prediction} from "../";
import WordMap from "../";
import * as map_without_alignment from './map_without_alignment';
import * as map_with_catboost from './map_with_catboost';

//const MISS_INCLUSION = 1.1; //100%
const MISS_INCLUSION = .1; //20%

const VERSES_SELECTED_FOR_TRAINING_STRIDE = 10;

const catboost_train_data = "dump_training_data_chinese.csv";


function word_map_get_all_predictions( m: WordMap, from_tokens: Token[], to_tokens: Token[] ): Prediction[]{
    const engine_run = (m as any).engine.run( from_tokens, to_tokens );
    return engine_run;
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

    console.log( `Selecting 1/${VERSES_SELECTED_FOR_TRAINING_STRIDE}th of the original ${common_keys.length} verses.`);
    //Here we will only keep every VERSES_SELECTED_FOR_TRAINING_STRIDE'th verse so that we are not training on everything.
    common_keys = common_keys.filter((_,index) => (index+1)%VERSES_SELECTED_FOR_TRAINING_STRIDE === 0);
    console.log( `This is ${common_keys.length}`);

    // //It wasn't working and I am thinking perhaps I am running out of memory so I will slice this.
    // common_keys = common_keys.slice(0,common_keys.length*3/4);

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

    
    const train_out_filehandle = fs.openSync(catboost_train_data, 'w');

    let header_line: string = "output,source,target,sLang,tLang," + map_with_catboost.catboostFeatureOrder.join(",");

    console.log( header_line )
    fs.writeSync(train_out_filehandle, `${header_line}\n` )


    //let all_suggestions: Suggestion[][] = [];
    for( let sentence_i = 0; sentence_i < Math.min(source_sentence_tokens_array.length, output_limit); ++sentence_i){
        const predictions = word_map_get_all_predictions( map, source_sentence_tokens_array[sentence_i], target_sentence_tokens_array[sentence_i] );

        const manual_mappings = hashed_manual_mappings.get( common_keys[sentence_i] );


        let num_correct_mappings = 0;
        for( let suggested_mapping_i = 0; suggested_mapping_i < predictions.length; ++suggested_mapping_i ){
            let output = 0;
            const suggested_mapping = predictions[suggested_mapping_i];

            for( let manual_mapping_i = 0; manual_mapping_i < manual_mappings.length; ++manual_mapping_i ){

                const manual_mapping = manual_mappings[manual_mapping_i];

                const manual_mapping_source = manual_mapping.sourceNgram;
                const suggested_mapping_source = suggested_mapping.source.getTokens();
                const manual_mapping_target = manual_mapping.targetNgram;
                const suggested_mapping_target = suggested_mapping.target.getTokens();

                conditionTestingBlock: {
                    //see if the ngram on the suggestion are the same length
                    if( manual_mapping_source.length != suggested_mapping_source.length ) break conditionTestingBlock;
                    if( manual_mapping_target.length != suggested_mapping_target.length ) break conditionTestingBlock;

                    //now check the source ngram is the same.
                    for( let source_ngram_i = 0; source_ngram_i < manual_mapping_source.length; ++source_ngram_i ){
                        const manual_word = manual_mapping_source[source_ngram_i];
                        const suggested_word = suggested_mapping_source[source_ngram_i];

                        if( manual_word.text        != suggested_word.toString()  ) break conditionTestingBlock;
                        if( manual_word.occurrence  != suggested_word.occurrence  ) break conditionTestingBlock;
                        if( manual_word.occurrences != suggested_word.occurrences ) break conditionTestingBlock;
                    }

                    //and the target ngram.
                    for( let target_ngram_i = 0; target_ngram_i < manual_mapping_target.length; ++target_ngram_i ){
                        const manual_word = manual_mapping_target[target_ngram_i];
                        const suggested_word = suggested_mapping_target[target_ngram_i];

                        if( manual_word.text        != suggested_word.toString()  ) break conditionTestingBlock;
                        if( manual_word.occurrence  != suggested_word.occurrence  ) break conditionTestingBlock;
                        if( manual_word.occurrences != suggested_word.occurrences ) break conditionTestingBlock;
                    }

                    output = 1;
                    num_correct_mappings++;
                }

            }

            if( Math.random() < MISS_INCLUSION ){
                const training_string = `${output},${suggested_mapping.source},${suggested_mapping.target},${map_without_alignment.source_lang},${map_without_alignment.target_lang},` + map_with_catboost.scores_to_catboost_features( suggested_mapping.getScores() )[0].join(",");
                console.log( training_string );
                fs.writeSync(train_out_filehandle, `${training_string}\n` )
            }

        }
        console.log( `----${sentence_i},${common_keys[sentence_i]},${manual_mappings.length},${predictions.length},${num_correct_mappings}`)

        if( global.gc ){
            global.gc();
        }
    }


    //const result_as_json: String = JSON.stringify( all_suggestions, null, 2 );
    //fs.writeFileSync("map_without_alignment.json", result_as_json, 'utf8');


    console.log( "done" );
}