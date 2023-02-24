import WordMap from "../";
import {Suggestion, Engine} from "../";
import * as fs from "fs-extra";

import Lexer,{Token} from "wordmap-lexer";



import * as process from 'process';

import v8 from 'v8';
// Greek to English
// export const source_tsv = "./src/josh_test/data/sources/NA27-YLT.tsv";
// export const target_tsv = "./src/josh_test/data/targets/NA27-YLT.tsv";
// export const source_lang = "na27";
// export const target_lang = "ylt";
// export const remapped_filename = "./src/josh_test/data/NA27-YLT-manual-Wordmap.json";
//const statistics_out_csv_filename = "./src/josh_test/results/map_without_alignment_stats.csv";

// Greek to Chinese.
export const source_tsv = "./src/josh_test/data/sources/NA27-CUVMP.tsv";
export const target_tsv = "./src/josh_test/data/targets/NA27-CUVMP.tsv";
export const source_lang = "na27";
export const target_lang = "cuvmp";
export const remapped_filename = "./src/josh_test/data/NA27-CUVMP-manual-Wordmap.json";
const statistics_out_csv_filename = "./src/josh_test/results/map_without_alignment_stats_chinese.csv";

export const ID_VERSE_START = 5;
export const ID_VERSE_AFTER_END = 8;

module.exports.bob = remapped_filename;


function parseTabSeparatedFile(filename: string): string[][] {
    const contents: string = fs.readFileSync(filename, "utf-8");
    const rows: string[] = contents.trim().split("\n");
    const parsed: string[][] = rows.map(row => row.split("\t"));
    return parsed;
}

function load_tsv_text( filename : string, use_lemma:boolean = false ){
    const parsed_file = parseTabSeparatedFile( filename );


    const id_index = parsed_file[0].indexOf( "identifier" );
    const text_index = parsed_file[0].indexOf( use_lemma ? "lemma": "text" );

    const sentences: string[][] = [];
    
    let active_verse = "";

    let current_sentence: string[] = [];
    for( let row_i = 1; row_i < parsed_file.length; ++row_i ){
        const current_verse = parsed_file[row_i][id_index].slice( ID_VERSE_START, ID_VERSE_AFTER_END );
        if( current_verse != active_verse ){
            current_sentence = [];
            sentences.push( current_sentence );
            active_verse = current_verse;
        }
        current_sentence.push( parsed_file[row_i][text_index] );
    }

    return sentences;
}

//This version doesn't just load all the verses into an array
//but instead returns a dictionary.
function load_tsv_text2( filename : string, use_lemma:boolean = false ){
    const parsed_file = parseTabSeparatedFile( filename );


    const id_index = parsed_file[0].indexOf( "identifier" );
    const text_index = parsed_file[0].indexOf( use_lemma ? "lemma": "text" );

    const sentences = new Map();
    

    for( let row_i = 1; row_i < parsed_file.length; ++row_i ){
        const current_verse = parsed_file[row_i][id_index].slice( 0, ID_VERSE_AFTER_END );
        if( !sentences.has(current_verse) ){
            sentences.set( current_verse, [] );
        }
        const current_sentence = sentences.get( current_verse );
        current_sentence.push( parsed_file[row_i][text_index] );
    }

    return sentences;
}

function word_map_predict_tokens( m: WordMap, from_tokens: Token[], to_tokens: Token[], maxSuggestions: number = 1, minConfidence: number = 0.1 ): Suggestion[]{
    const engine_run = (m as any).engine.run( from_tokens, to_tokens );
    const predictions = (m as any).engine.score( engine_run );
    const suggestions = Engine.suggest(predictions, maxSuggestions, (m as any).forceOccurrenceOrder, minConfidence);
    return suggestions;
}


export function load_tokens_from_tsv( tsv_filename: string, use_lemma: boolean=false ){
    const sentences = load_tsv_text2(tsv_filename, use_lemma);
    //const sentence_tokens = new Map(Array.from( sentences, ([key,value]) => [key, Lexer.tokenizeWords(value)]));
    const sentence_tokens = new Map(Array.from( sentences, ([key,value]) => [key, Lexer.tokenize(value.join(' '))]));
    return sentence_tokens
}

export function load_corpus_into_wordmap( source_sentence_tokens_array: Token[][], target_sentence_tokens_array: Token[][] ){
    const map = new WordMap();
    const chunk_size = 1000;
    for( let i = 0; i < source_sentence_tokens_array.length; i+=chunk_size ){
        console.log( `mapping sentence length of ${source_sentence_tokens_array[i].length} to ${target_sentence_tokens_array[i].length}`);

        const before_snap_shot = v8.getHeapStatistics().used_heap_size;
        //console.log( source_sentence_tokens_array[i] );
        map.appendCorpusTokens( source_sentence_tokens_array.slice(i,Math.min(i+chunk_size,source_sentence_tokens_array.length)), 
                                target_sentence_tokens_array.slice(i,Math.min(i+chunk_size,target_sentence_tokens_array.length)) );
        

        const after_snap_shot = v8.getHeapStatistics().used_heap_size;
        console.log( `appended tokens ${i} memory is ${after_snap_shot}` );
        if( global.gc ){
            global.gc();
        }else{
            console.log( "no global.gc" );
        }
    }
    return map;
}


if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );
    
    //load sentences and tokenize them.
    const source_sentence_tokens = load_tokens_from_tsv(source_tsv, true);
    const target_sentence_tokens = load_tokens_from_tsv(target_tsv);

    //Here I could inject the stringNumber and lemma and morph codes into the tokens.

    //figure out what sentence codes are common in both.
    let common_keys = Array.from(source_sentence_tokens.keys()).filter(key => target_sentence_tokens.has(key));


    //It wasn't working and I am thinking perhaps I am running out of memory so I will slice this.
    common_keys = common_keys.slice(0,common_keys.length*3/4);

    const source_sentence_tokens_array : Token[][] = common_keys.map( (key) => source_sentence_tokens.get(key) ) as Token[][]
    const target_sentence_tokens_array : Token[][] = common_keys.map( (key) => target_sentence_tokens.get(key) ) as Token[][]

    //now do the WordMap thingy.
    const map = load_corpus_into_wordmap( source_sentence_tokens_array, target_sentence_tokens_array );


    //load the manual mapping so we can score as we go along.
    const all_manual_mappings = JSON.parse(fs.readFileSync(remapped_filename, 'utf-8') );

    //hash the manual mappings by verse_id so we can look them up.
    const hashed_manual_mappings = new Map();
    for( let mapping_i = 0; mapping_i < all_manual_mappings.length; ++mapping_i ){
        const verse_id = all_manual_mappings[mapping_i].sourceNgram[0].id.slice(0,ID_VERSE_AFTER_END);
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

    //let all_suggestions: Suggestion[][] = [];
    for( let sentence_i = 0; sentence_i < Math.min(source_sentence_tokens_array.length, output_limit); ++sentence_i){
        const suggestions: Suggestion[] = word_map_predict_tokens( map, source_sentence_tokens_array[sentence_i], target_sentence_tokens_array[sentence_i] );
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