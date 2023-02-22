import WordMap from "../";
import {Suggestion, Engine} from "../";
import * as fs from "fs-extra";

import Lexer,{Token} from "wordmap-lexer";



import * as process from 'process';

import v8 from 'v8';


const source_tsv = "./src/josh_test/data/sources/NA27-YLT.tsv"
const target_tsv = "./src/josh_test/data/targets/NA27-YLT.tsv"
const ID_VERSE_START = 5;
const ID_VERSE_AFTER_END = 8;

const currentDirectory: string = process.cwd();
console.log('Current working directory:', currentDirectory);


console.log( "starting" );


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

//Load the sentences
const source_sentences = load_tsv_text2(source_tsv, true);
const target_sentences = load_tsv_text2(target_tsv);

//Now convert them into tokens.
// const source_sentence_tokens_by_word = new Map(Array.from( source_sentences, ([key,value]) => [key, Lexer.tokenizeWords(value)]));
// const target_sentence_tokens_by_word = new Map(Array.from( target_sentences, ([key,value]) => [key, Lexer.tokenizeWords(value)]));
const source_sentence_tokens = new Map(Array.from( source_sentences, ([key,value]) => [key, Lexer.tokenize(value.join(' '))]));
const target_sentence_tokens = new Map(Array.from( target_sentences, ([key,value]) => [key, Lexer.tokenize(value.join(' '))]));

//Here I could inject the stringNumber and lemma and morph codes into the tokens.

//figure out what sentence codes are common in both.
let common_keys = Array.from(source_sentence_tokens.keys()).filter(key => target_sentence_tokens.has(key));


//It wasn't working and I am thinking perhaps I am running out of memory so I will slice this.
common_keys = common_keys.slice(0,common_keys.length/16);

const source_sentence_tokens_array : Token[][] = common_keys.map( (key) => source_sentence_tokens.get(key) ) as Token[][]
const target_sentence_tokens_array : Token[][] = common_keys.map( (key) => target_sentence_tokens.get(key) ) as Token[][]

//now do the WordMap thingy.
const map = new WordMap();
for( let i = 0; i < source_sentence_tokens_array.length; ++i ){
    if( target_sentence_tokens_array[i].length > 30 ){
       console.log( "we have big" );
    }
    console.log( `going to work with tokens of length ${source_sentence_tokens_array[i].length} to ${target_sentence_tokens_array[i].length}`);
    //console.log( source_sentence_tokens_array[i] );
    map.appendCorpusTokens( [source_sentence_tokens_array[i]], [target_sentence_tokens_array[i]] );
    console.log( `appended tokens ${i} memory is ${v8.getHeapSnapshot()}` );
    if( global.gc ){
        global.gc();
    }else{
        console.log( "no global.gc" );
    }
}



// let mapping_suggestions: Suggestion[][] = [];
// for( let sentence_i = 0; sentence_i < source_sentence_tokens.length; ++sentence_i){
//     const mapping_suggestion: Suggestion[] = word_map_predict_tokens( map, source_sentence_tokens[sentence_i], target_sentence_tokens[sentence_i] )
//     mapping_suggestions.push( mapping_suggestion );
// }


// const result_as_json: String = JSON.stringify( mapping_suggestions, null, 2 );
// fs.writeFileSync("map_without_alignment.json", result_as_json, 'utf8');


console.log( "ending" );