Auto Footage Courtesy

Current version: v1.0.1

What changed in v1.0.1
- Added a built-in GitHub updater area in the panel
- The panel can auto-check the official GitHub repo for newer releases on open
- A newer release zip can be downloaded into the panel updates folder with restart instructions
- Hidden-track coverage checks only look at the upper two video tracks
- Partially covered clips still get courtesy text when the visible portion meets the minimum duration
- Duplicate source keys now use the earliest visible segment after coverage is removed

What changed in older versions

v5.2
- Hidden or inactive clips are skipped
- Clips covered by a higher visible video layer are skipped, so only the top visible source is considered
- v5.1 behavior is otherwise unchanged

v5.1
- Output format is now: Footage courtesy of [text after @]. [suffix]
- You can choose the target video track for the courtesy text layer
- Source clips are scanned on V1 up to the user-entered track where available, excluding the target text track
- Uniqueness is based on the text after @, not the full filename
- Repeated clips only generate one courtesy text at the first valid occurrence
- Clips shorter than the minimum duration are skipped; default is 2 seconds
- If the active sequence has In and Out points set, only that range is processed
- If no In and Out points are set, the whole active sequence is processed

Install on Windows
1. Unzip the folder.
2. Run `Install Auto Footage Courtesy.bat`.
3. The installer copies the extension into:
   %APPDATA%\Adobe\CEP\extensions\Auto Footage Courtesy
4. The installer removes known older installs first so Premiere does not load conflicting versions.
5. The installer checks `HKCU\Software\Adobe\CSXS.11\PlayerDebugMode` and can enable it for the current Windows user if needed.
6. Restart Premiere Pro.
7. Open from:
   Window -> Extensions -> Auto Footage Courtesy

Usage
1. Prepare a .mogrt with one editable text parameter.
2. Put your source footage on the video tracks you want to scan.
3. Set the MOGRT path.
4. Set the text parameter name, usually title or Source Text.
5. Choose the target video track for the courtesy layer.
6. Set Scan Source Tracks Up To for the highest source video track to include.
7. Optionally set sequence In and Out points in Premiere if you want to process only a selected range.
8. Set minimum clip length if needed.
9. Click Generate Courtesy Text.

Notes
- The script uses the first valid occurrence in time for each unique text after @.
- Example: 1@almond.mp4 and 2@almond.mp4 only create one courtesy text.
- Example output: Footage courtesy of almond. Thank you.
- For clips that overlap a selected In/Out range, only the overlapping portion is counted for duration and placement.
- If a source clip is hidden, inactive, or underneath a higher visible source clip, it is ignored.




