| File Name | Purpose |
| dump_training_data_chinese.csv | This is a dump of data for training catboost (or xgboost) in a jupyter notebook.  This one is from greek to Chinese. |
| NA27-CUVMP-manual-Wordmap.json | This is a wordmap from Greek lemmas to Chinese in a format which can be compared with Wordmap. |
| NA27-YLT-manual-Wordmap.json | This is the same thing as NA27-CUVMP-manual-Wordmap.json but Greek lemmas to English (YLT) instead. |
| targets | This directory holds the target texts which the word alignments map from.  English and Chinese |
| dump_training_data.csv | This is the same as dump_training_data_chinese.csv except for Greek Lemmas to English (YLT).  Used for training CatBoost. |
| NA27-YLT-manual.json | This is the source file which was used to generate NA27-YLT-manual-Wordmap.json .  It has the mappings from NA27 to YLT but in a way that isn't easy to compare to the output of wordmap. |
| sources | This directory holds the source texts which the word alignments map from.  Basically greek lemmas currently. |