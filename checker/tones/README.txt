Custom tones for the checker sound engine
=========================================

The note voice can be swapped at runtime. Six synth voices are built in
(glass, bowl, kalimba, pad, breath, sine). You can add your own recordings here.

1. Drop an audio file in this folder: WAV, MP3 or M4A, a single clean note,
   2-8 seconds long, little silence at the start, letting it ring out.
2. Add an entry to tones.json:

   {"tones": [
     {"name": "bowl-recording", "file": "bowl.wav", "root": "D3"}
   ]}

   name  - what shows up in the tone list (optional; defaults to the file name)
   file  - path relative to this folder
   root  - the pitch of the recording, as a note name ("D3", "F#2", "Bb3")
           or a MIDI number (50 = D3). Optional; defaults to D3.

3. Reload the page. Samples are loaded after sound is started; any file that
   fails to load is skipped. Pick a tone with the tone control, or open the
   page with ?tone=<name> (e.g. ?tone=bowl-recording or ?tone=pad).

The engine repitches the sample to each note in the current scale, so a note
near the middle of the range (around D3-D4) sounds most natural.
