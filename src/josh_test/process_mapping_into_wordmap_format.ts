
import * as fs from "fs-extra";

//In this file we take the manual mapping which references the word numbers and convert it into the same 
//datastructure type produced by wordmap.

const source_tsv = "./src/josh_test/data/sources/NA27-YLT.tsv"
const target_tsv = "./src/josh_test/data/targets/NA27-YLT.tsv"
const in_mapping_filename = "./src/josh_test/data/NA27-YLT-manual.json"
const out_mapping_filename = "./src/josh_test/data/NA27-YLT-manual-Wordmap.json"

function parseTabSeparatedFile(filename: string): string[][] {
    const contents: string = fs.readFileSync(filename, "utf-8");
    const rows: string[] = contents.trim().split("\n");
    const parsed: string[][] = rows.map(row => row.split("\t"));
    return parsed;
}


const ID_VERSE_START = 5;
const ID_VERSE_AFTER_END = 8;
function load_tsv_text_with_ids( filename : string, use_lemma:boolean = false ) : string[][][]{
    const parsed_file = parseTabSeparatedFile( filename );


    const id_index = parsed_file[0].indexOf( "identifier" );
    const text_index = parsed_file[0].indexOf( use_lemma ? "lemma": "text" );

    const sentences: string[][][] = [];
    
    let active_verse = "";

    let current_sentence: string[][] = [];
    for( let row_i = 1; row_i < parsed_file.length; ++row_i ){
        const id = parsed_file[row_i][id_index];
        const current_verse = id.slice( ID_VERSE_START, ID_VERSE_AFTER_END );
        if( current_verse != active_verse ){
            current_sentence = [];
            sentences.push( current_sentence );
            active_verse = current_verse;
        }
        current_sentence.push( [id,parsed_file[row_i][text_index]] );
    }

    return sentences;
}

function mapIdToOccurrenceNum( filename : string, use_lemma:boolean = false ){
    const sentences_with_ids: string[][][] = load_tsv_text_with_ids( filename, use_lemma );

    const id_to_occurrence = new Map();

    for( let sentence_i = 0; sentence_i < sentences_with_ids.length; ++sentence_i ){
        const sentence: string[][] = sentences_with_ids[sentence_i];
        for( let word_i = 0; word_i < sentence.length; ++word_i ){
            const this_word: string = sentence[word_i][1]; //0 is id, 1 is word
            const this_word_id: string = sentence[word_i][0];
            //we have a specific word in a specific sentence.  We need to figure out how many there 
            //are and which one this is.
            let occurrence = -1;
            let occurrences = 0;
            for( let other_word_i = 0; other_word_i < sentence.length; ++other_word_i ){
                if( sentence[other_word_i][1] == this_word ){
                    occurrences += 1;
                }
                if( other_word_i == word_i ){
                    occurrence = occurrences;
                }
            }
            id_to_occurrence.set( this_word_id, {
                text: this_word,
                occurrence: occurrence,
                occurrences: occurrences,
                id: this_word_id
            })
        }
    }

    return id_to_occurrence;
}

const source_id_to_occurrence = mapIdToOccurrenceNum( source_tsv, true );
const target_id_to_occurrence = mapIdToOccurrenceNum( target_tsv );

const mapping = JSON.parse(fs.readFileSync(in_mapping_filename, 'utf-8') );

const remapped = [];

for( let mapping_i = 0; mapping_i < mapping.length; ++mapping_i ){
    const sourceNgram = [];
    const source_ids = (Object.values(mapping[mapping_i])[0] as any).sources;
    for( let source_i = 0; source_i < source_ids.length; ++source_i ){
        const source_id = source_ids[source_i]
        const source_word = source_id_to_occurrence.get( source_id );
        sourceNgram.push( source_word )
    }
    const targetNgram = [];
    const target_ids = (Object.values(mapping[mapping_i])[0] as any).targets;
    for( let target_i = 0; target_i < target_ids.length; ++target_i ){
        const target_id = target_ids[target_i]
        const target_word = target_id_to_occurrence.get( target_id );
        targetNgram.push( target_word )
    }

    remapped.push({
        sourceNgram: sourceNgram,
        targetNgram: targetNgram,
    })
}

fs.writeFileSync(out_mapping_filename, JSON.stringify( remapped, null, 2 ), 'utf8');