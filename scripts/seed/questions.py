"""Crypto Hunt seed question bank (P5 · T-502, D-018, D-029, D-036).

Hand-written, simple to answer, clean general humour, no campus in-jokes. Every code question is run here (Python
with python3, JavaScript with node) and its stated answer is checked against the real output, so a coding answer
can never be wrong. Writes supabase/seed/questions.csv in the admin CSV import format (lib/admin/questions.ts).

    python3 -I scripts/seed/questions.py        # verify + write the CSV
    npm run check:questions                     # the app's own CSV checker over the result
"""
import csv
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "supabase" / "seed" / "questions.csv"
LETTERS = "ABCD"
TECH = {"coding", "tech"}

Q = []  # (difficulty, category, format, text, options, right, answer, alternatives, hint, code)


def mcq(d, cat, text, options, right=0, code=None):
    assert len(options) == 4, text
    Q.append((d, cat, "mcq", text, list(options), right, None, [], None, code))


def word(d, cat, text, answer, alts=(), hint=None, code=None):
    Q.append((d, cat, "text", text, None, None, answer, list(alts), hint, code))


def num(d, cat, text, answer, alts=(), hint=None, code=None):
    Q.append((d, cat, "number", text, None, None, str(answer), [str(a) for a in alts], hint, code))


PY, JS = "py", "js"
LINES, EMPTY = "lines", "empty"  # check the number of printed lines / that nothing visible is printed

# ── Level 1 ─────────────────────────────────────────────────────────────────────────────────────────
mcq(1, "coding", 'What does this print?\nprint(2 + 3)', ["5", "23", "2 + 3", "Error"], code=PY)
mcq(1, "coding", 'What does this print?\nprint("ha" * 3)', ["hahaha", "ha3", "ha ha ha", "Error"], code=PY)
num(1, "coding", 'What does this print?\nprint(len("cat"))', 3, hint="Count the letters", code=PY)
num(1, "coding", "What does this print?\nprint(10 - 4)", 6, hint="Simple subtraction", code=PY)
word(1, "coding", 'What does this print?\nprint("Hello"[0])', "H", hint="Python counts from 0", code=PY)
mcq(1, "coding", "Which symbol starts a comment in Python?", ["#", "//", "--", "/*"])
num(1, "coding", "What does this print?\nx = 4\nx = x + 1\nprint(x)", 5, hint="x grows by one", code=PY)
word(1, "coding", 'What does this print?\nprint("cat" + "dog")', "catdog", hint="+ joins text together", code=PY)
mcq(1, "coding", "What does this print?\nprint(type(5).__name__)", ["int", "float", "str", "bool"], code=PY)
num(1, "coding", "What does this print?\nprint(len([4, 8, 15]))", 3, hint="How many items are in the list?", code=PY)
mcq(1, "coding", "Which of these is a Python list?", ["[1, 2, 3]", "(1, 2, 3)", "{1, 2, 3}", "<1, 2, 3>"])
mcq(1, "coding", 'What does this print?\nprint("5" + "5")', ["55", "10", "5 + 5", "Error"], code=PY)
mcq(1, "coding", "What does this print?\nprint(1 + 1 == 2)", ["True", "False", "2", "Error"], code=PY)
mcq(1, "tech", 'What does "www" stand for in a web address?', ["World Wide Web", "World Wide Wire", "Web Wide World", "Wide World Web"])
mcq(1, "tech", "Which keyboard shortcut copies on Windows?", ["Ctrl + C", "Ctrl + V", "Ctrl + X", "Ctrl + Z"])
word(1, "tech", "What do programmers call a mistake in their code?", "bug", ["a bug", "bugs"], "Also a small insect")
mcq(1, "tech", "Which company makes the iPhone?", ["Apple", "Samsung", "Google", "Nokia"])
mcq(1, "tech", "Which of these is a web browser?", ["Chrome", "Excel", "Photoshop", "Windows"])
num(1, "tech", "How many bits are in one byte?", 8, hint="More than 4, fewer than 10")
mcq(1, "tech", 'What does "AI" stand for?', ["Artificial Intelligence", "Automatic Internet", "Advanced Input", "Actual Information"])
mcq(1, "tech", "Which shortcut undoes your last action on most computers?", ["Ctrl + Z", "Ctrl + U", "Ctrl + Y", "Ctrl + D"])
word(1, "tech", "Which part of a computer do you move around to point at the screen?", "mouse", ["a mouse", "computer mouse"], "Shares its name with a small animal")
mcq(1, "tech", "Which device do you use to type letters into a computer?", ["Keyboard", "Monitor", "Speaker", "Printer"])
mcq(1, "tech", "Which of these is a video-calling app?", ["Zoom", "Paint", "Notepad", "Calculator"])
word(1, "science", "What is the largest planet in our solar system?", "Jupiter", hint="Named after the king of the Roman gods")
mcq(1, "gk", "Which animal is known as the King of the Jungle?", ["Lion", "Tiger", "Elephant", "Bear"])
num(1, "geography", "How many continents are there on Earth?", 7, hint="Asia is the biggest of them")
word(1, "gk", "What colour do you get when you mix blue and yellow?", "green", hint="The colour of leaves")
mcq(1, "gk", "What is the national animal of India?", ["Tiger", "Lion", "Elephant", "Peacock"])
word(1, "geography", "What is the capital of India?", "New Delhi", ["delhi", "newdelhi"], "Home of the Red Fort")
num(1, "science", "How many legs does a spider have?", 8, hint="More than an insect's six")
mcq(1, "culture", "Which festival is known as the festival of lights?", ["Diwali", "Holi", "Eid", "Christmas"])
word(1, "science", "What is frozen water called?", "ice", hint="Cold and slippery")
num(1, "gk", "How many hours are in a day?", 24, hint="Two times twelve")
mcq(1, "math", "Which shape has three sides?", ["Triangle", "Square", "Circle", "Pentagon"])
num(1, "math", "What is 12 × 12?", 144, hint="A dozen dozens")
mcq(1, "science", "In which direction does the sun rise?", ["East", "West", "North", "South"])
word(1, "gk", 'What is the opposite of "hot"?', "cold", hint="How ice feels")
word(1, "science", "Which organ pumps blood around your body?", "heart", ["the heart"], "It beats")
num(1, "sports", "How many players does a cricket team have on the field?", 11, hint="More than ten")
mcq(1, "gk", "What is the national bird of India?", ["Peacock", "Parrot", "Eagle", "Sparrow"])
word(1, "science", "What do bees make?", "honey", hint="Sweet and golden")
num(1, "gk", "How many days are in a leap year?", 366, hint="One more than usual")
mcq(1, "science", "What do caterpillars turn into?", ["Butterflies", "Bees", "Spiders", "Worms"])
word(1, "gk", "What colour is a ripe banana?", "yellow", hint="Like the sun in drawings")
mcq(1, "science", "Which planet do we live on?", ["Earth", "Mars", "Venus", "Jupiter"])
num(1, "math", "How many sides does a square have?", 4, hint="Same as a rectangle")
word(1, "sports", "Which sport is played at Wimbledon?", "tennis", ["lawn tennis"], "Rackets and a fuzzy yellow ball")
num(1, "science", "How many colours are in a rainbow?", 7, hint="Think VIBGYOR")
mcq(1, "gk", "Which of these is a fruit?", ["Mango", "Potato", "Carrot", "Onion"])
word(1, "geography", "What is the capital of Karnataka?", "Bengaluru", ["bangalore"], "India's Silicon Valley")
num(1, "gk", "How many wheels does a bicycle have?", 2, hint="Bi means two")
word(1, "geography", "What is the capital of Maharashtra?", "Mumbai", ["bombay"], "Home of Bollywood")
mcq(1, "science", "Which of these animals can fly?", ["Bat", "Elephant", "Dolphin", "Snake"])
word(1, "gk", "What do you call a house made of ice blocks?", "igloo", ["an igloo"], "Built in very cold places")
mcq(1, "gk", "What is the main ingredient of guacamole?", ["Avocado", "Tomato", "Potato", "Cucumber"])
mcq(1, "gk", "Which colour is at the top of the Indian flag?", ["Saffron", "Green", "White", "Blue"])
word(1, "gk", "Which animal is known as the ship of the desert?", "camel", ["a camel"], "It has a hump")
num(1, "math", "You have 5 chocolates and eat 2. How many are left?", 3, hint="Subtract")
word(1, "riddle", "What has keys but can't open locks?", "keyboard", ["piano", "a piano", "a keyboard"], "You might be typing on one")
word(1, "riddle", "What gets wetter the more it dries?", "towel", ["a towel"], "You use it after a bath")
mcq(1, "meme", "Why did the developer go broke?", ["He used up all his cache", "He forgot his password", "His laptop ran out of charge", "He deleted the internet"])
word(1, "riddle", "I'm tall when I'm young and short when I'm old. What am I?", "candle", ["a candle"], "It melts as it burns")
mcq(1, "meme", '"It works on my machine!" is a famous excuse from…', ["Programmers", "Doctors", "Pilots", "Chefs"])
word(1, "riddle", "What has a head and a tail but no body?", "coin", ["a coin"], "Flip it to decide")
mcq(1, "meme", 'Which emoji is called "face with tears of joy"?', ["😂", "😭", "😅", "😡"])
word(1, "riddle", "What has hands but can't clap?", "clock", ["a clock", "watch", "a watch"], "It tells the time")
mcq(1, "funny", 'Which animal says "moo"?', ["Cow", "Dog", "Cat", "Duck"])
word(1, "riddle", "What goes up but never comes down?", "age", ["your age", "my age"], "It changes every birthday")

# ── Level 2 ─────────────────────────────────────────────────────────────────────────────────────────
mcq(2, "coding", "What does this print?\nprint(3 ** 2)", ["9", "6", "8", "32"], code=PY)
num(2, "coding", "How many lines does this print?\nfor i in range(3):\n    print(i)", 3, hint="range(3) gives 0, 1, 2", code=(PY, LINES))
num(2, "coding", "What does this print?\ntotal = 0\nfor n in [1, 2, 3, 4]:\n    total += n\nprint(total)", 10, hint="Add them up", code=PY)
word(2, "coding", 'What does this print?\nprint("python"[-1])', "n", hint="-1 means the last letter", code=PY)
mcq(2, "coding", "What does this print?\nprint(5 == 5.0)", ["True", "False", "Error", "None"], code=PY)
word(2, "coding", 'Fix the bug: which word should replace prnt?\nprnt("Hello")', "print", hint="The usual way to show text in Python")
num(2, "coding", "What does this print?\nx = [10, 20, 30]\nprint(x[1])", 20, hint="Python counts from 0", code=PY)
mcq(2, "coding", "What does this print?\nprint(bool(0))", ["False", "True", "0", "None"], code=PY)
word(2, "coding", 'What does this print?\nprint("Hi".replace("i", "o"))', "Ho", hint="i is swapped for o", code=PY)
mcq(2, "coding", 'What does this print?\nprint(int("7") + 3)', ["10", "73", "Error", "7 + 3"], code=PY)
num(2, "coding", 'What does this print?\nprint(len("hello world"))', 11, hint="The space counts too", code=PY)
mcq(2, "coding", 'In JavaScript, what does this print?\nconsole.log(typeof "5")', ["string", "number", "char", "text"], code=JS)
num(2, "coding", "What does this print?\nprint(max(4, 9, 2))", 9, hint="max picks the biggest", code=PY)
mcq(2, "tech", "What does HTML stand for?", ["HyperText Markup Language", "High Text Machine Language", "Hyperlink and Text Markup Language", "Home Tool Markup Language"])
mcq(2, "tech", "Which of these keeps your files when the power goes off?", ["SSD", "RAM", "CPU cache", "Registers"])
word(2, "tech", 'What does the "S" in HTTPS stand for?', "secure", hint="It means your connection is protected")
mcq(2, "tech", "Which company owns Android today?", ["Google", "Apple", "Microsoft", "Samsung"])
num(2, "tech", "What is the binary number 101 in decimal?", 5, hint="4 + 0 + 1")
mcq(2, "tech", "Which of these is NOT an operating system?", ["Excel", "Linux", "Windows", "macOS"])
word(2, "tech", "What is the main circuit board inside a computer called?", "motherboard", ["mainboard", "mother board"], "Every other part plugs into it")
mcq(2, "tech", "Which language is mainly used to style web pages?", ["CSS", "SQL", "C", "Java"])
mcq(2, "tech", "Which keyboard shortcut pastes on Windows?", ["Ctrl + V", "Ctrl + P", "Ctrl + C", "Ctrl + B"])
word(2, "tech", "What is the name of Apple's voice assistant?", "Siri", hint="Four letters, starts with S")
word(2, "geography", "What is the capital of Japan?", "Tokyo", hint="It hosted the 2020 Olympics")
num(2, "geography", "How many states does India have?", 28, hint="Between 25 and 30")
mcq(2, "history", "Who was the first Prime Minister of India?", ["Jawaharlal Nehru", "Sardar Patel", "Indira Gandhi", "Rajendra Prasad"])
word(2, "science", "Which planet is closest to the Sun?", "Mercury", hint="Also a liquid metal")
mcq(2, "science", "What is the hardest natural substance?", ["Diamond", "Iron", "Gold", "Granite"])
num(2, "math", "How many sides does a hexagon have?", 6, hint="Think of a honeycomb cell")
word(2, "science", "What is the chemical formula of water?", "H2O", hint="Two hydrogens and one oxygen")
num(2, "history", "In which year did India become independent?", 1947, hint="15 August, just after World War II")
mcq(2, "culture", "Which instrument has 88 keys?", ["Piano", "Guitar", "Violin", "Flute"])
word(2, "geography", "What is the currency of Japan?", "yen", hint="Three letters")
mcq(2, "geography", "Mount Everest lies on the border of Nepal and…", ["China", "India", "Bhutan", "Pakistan"])
num(2, "math", "How many minutes are in 2 hours?", 120, hint="60 + 60")
word(2, "history", "Who painted the Mona Lisa?", "Leonardo da Vinci", ["da vinci", "leonardo", "davinci", "leonardo davinci"], "An Italian genius of the Renaissance")
mcq(2, "science", "Which blood cells fight infections?", ["White blood cells", "Red blood cells", "Platelets", "Plasma"])
word(2, "geography", "Which ocean is the largest?", "Pacific", ["pacific ocean", "the pacific"], "Its name means peaceful")
mcq(2, "science", "Which gas do we breathe in to stay alive?", ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"])
num(2, "gk", "How many weeks are in a year?", 52, hint="A bit more than 50")
word(2, "geography", "Which country is famous for the pyramids of Giza?", "Egypt", hint="The river Nile flows through it")
mcq(2, "history", "Who is known as the Father of the Nation in India?", ["Mahatma Gandhi", "Jawaharlal Nehru", "Subhas Chandra Bose", "B. R. Ambedkar"])
num(2, "sports", "How many players from one team are on the mat in kabaddi?", 7, hint="Fewer than cricket")
word(2, "gk", "What do you call a baby dog?", "puppy", ["pup"], "Rhymes with guppy")
mcq(2, "science", "Which is the largest mammal?", ["Blue whale", "Elephant", "Giraffe", "Hippopotamus"])
word(2, "science", "Which gas do plants take in from the air?", "carbon dioxide", ["co2", "carbon-dioxide"], "We breathe it out")
mcq(2, "sports", "Which sport uses a shuttlecock?", ["Badminton", "Tennis", "Squash", "Table tennis"])
num(2, "math", "What is 15 + 27?", 42, hint="A famous answer to everything")
num(2, "gk", "How many years are in a century?", 100, hint="Cent means hundred")
word(2, "gk", "What is the national flower of India?", "lotus", hint="It grows in muddy water")
num(2, "riddle", "How many months have 28 days?", 12, hint="Read it carefully: every month has at least 28")
word(2, "riddle", "What can you catch but not throw?", "cold", ["a cold"], "Achoo!")
word(2, "riddle", "What has to be broken before you can use it?", "egg", ["an egg"], "Breakfast")
mcq(2, "meme", 'Finish the line: "Keep calm and…"', ["carry on", "run away", "shout loudly", "go to sleep"])
word(2, "riddle", "What has one eye but cannot see?", "needle", ["a needle"], "Used for sewing")
mcq(2, "meme", 'What is a "meme", usually?', ["A funny picture or video shared online", "A type of computer virus", "A music instrument", "A cooking recipe"])
word(2, "riddle", "What runs but never walks, and has a mouth but never talks?", "river", ["a river"], "It flows to the sea")
mcq(2, "meme", "In the classic arcade game, what does Pac-Man eat?", ["Dots", "Coins", "Bananas", "Stars"])
word(2, "riddle", "Which building has the most stories?", "library", ["a library", "the library"], "Full of books")
mcq(2, "meme", "Twitter's old logo (before it became X) was a…", ["Bird", "Fish", "Cat", "Star"])
num(2, "math", "A cat has 4 legs. How many legs do 3 cats have?", 12, hint="Multiply")
mcq(2, "meme", 'Which superhero calls himself your "friendly neighbourhood" hero?', ["Spider-Man", "Batman", "Superman", "Iron Man"])

# ── Level 3 ─────────────────────────────────────────────────────────────────────────────────────────
num(3, "coding", "What does this print?\nx = 5\ny = x\nx = 10\nprint(y)", 5, hint="y got the old value", code=PY)
mcq(3, "coding", "What does this print?\nprint([1, 2, 3][::-1])", ["[3, 2, 1]", "[1, 2, 3]", "[3]", "Error"], code=PY)
num(3, "coding", "What does this print?\ncount = 0\nfor i in range(1, 11):\n    if i % 2 == 0:\n        count += 1\nprint(count)", 5, hint="How many even numbers from 1 to 10?", code=PY)
num(3, "coding", 'What does this print?\nprint("banana".count("a"))', 3, hint="Count the a's", code=PY)
mcq(3, "coding", 'Fix the bug: what is missing?\nif x > 5\n    print("big")', ["A colon after 5", "A bracket after if", "A semicolon after 5", "Quotes around x"])
num(3, "coding", "What does this print?\ndef double(n):\n    return n * 2\nprint(double(double(3)))", 12, hint="Double it twice", code=PY)
mcq(3, "coding", "What does this print?\nprint(10 / 4)", ["2.5", "2", "2.0", "3"], code=PY)
word(3, "coding", 'What does this print?\nwords = ["sun", "moon", "star"]\nprint(words[-1])', "star", hint="-1 is the last item", code=PY)
mcq(3, "coding", 'In JavaScript, what does this print?\nconsole.log(1 + "1")', ["11", "2", "NaN", "Error"], code=JS)
num(3, "coding", "What does this print?\nnums = [3, 7, 1, 9]\nprint(max(nums) - min(nums))", 8, hint="Biggest minus smallest", code=PY)
mcq(3, "coding", 'What does this print?\nprint("a" in "cat")', ["True", "False", "Error", "a"], code=PY)
num(3, "coding", "What does this print?\ni = 0\nwhile i < 5:\n    i += 2\nprint(i)", 6, hint="0, 2, 4, then one more step", code=PY)
word(3, "coding", 'What does this print?\nprint("-".join(["a", "b", "c"]))', "a-b-c", hint="join puts the dash between", code=PY)
mcq(3, "coding", 'What does this print?\nprint("Python"[1:4])', ["yth", "Pyt", "ytho", "thon"], code=PY)
num(3, "coding", "What does this print?\nprint(abs(-7))", 7, hint="abs drops the minus sign", code=PY)
num(3, "coding", 'What does this print?\nprint("hello".find("l"))', 2, hint="Where is the first l? Count from 0", code=PY)
mcq(3, "tech", "What does SQL stand for?", ["Structured Query Language", "Simple Question Language", "System Query Logic", "Stored Query List"])
mcq(3, "tech", "Which protocol does your browser use to load web pages?", ["HTTP", "FTP", "SMTP", "SSH"])
num(3, "tech", "What is the binary number 1010 in decimal?", 10, hint="8 + 0 + 2 + 0")
mcq(3, "tech", 'Which data structure is "first in, first out"?', ["Queue", "Stack", "Tree", "Graph"])
mcq(3, "tech", "Which of these is a version control system?", ["Git", "Jira", "Slack", "Figma"])
word(3, "tech", "What does RAM stand for?", "Random Access Memory", ["random-access memory"], "R is for Random")
mcq(3, "tech", 'What does a "404" error on a website mean?', ["Page not found", "The server is on fire", "No internet at all", "Wrong password"])
word(3, "tech", "Who co-founded Microsoft with Paul Allen?", "Bill Gates", ["gates", "bill"], "Once the richest person in the world")
mcq(3, "coding", "Which file extension do Python files use?", [".py", ".pt", ".pn", ".java"])
mcq(3, "tech", "Which HTML tag makes a clickable link?", ["<a>", "<link>", "<href>", "<url>"])
word(3, "tech", "What do you call software that protects a computer from viruses?", "antivirus", ["anti-virus", "antivirus software", "anti virus"], "Anti + virus")
mcq(3, "culture", 'Who wrote "Romeo and Juliet"?', ["William Shakespeare", "Charles Dickens", "Rabindranath Tagore", "Mark Twain"])
num(3, "math", "What is the smallest prime number?", 2, hint="It's the only even prime")
mcq(3, "history", "Which country gave the Statue of Liberty to the USA?", ["France", "United Kingdom", "Spain", "Italy"])
word(3, "geography", "What is the capital of Australia?", "Canberra", hint="Not Sydney!")
num(3, "science", "How many bones does an adult human have?", 206, hint="Just over 200")
mcq(3, "science", "Which vitamin does your skin make in sunlight?", ["Vitamin D", "Vitamin C", "Vitamin A", "Vitamin B12"])
word(3, "geography", "Which Indian city is called the Pink City?", "Jaipur", hint="Capital of Rajasthan")
num(3, "science", "At what temperature in Celsius does water boil at sea level?", 100, hint="A round number")
mcq(3, "science", "Which planet is most famous for its rings?", ["Saturn", "Mars", "Mercury", "Venus"])
word(3, "science", "What is the longest bone in the human body?", "femur", ["thigh bone", "thighbone"], "It's in your thigh")
mcq(3, "history", "Who discovered penicillin?", ["Alexander Fleming", "Isaac Newton", "Thomas Edison", "Marie Curie"])
num(3, "science", "How many teeth does an adult human usually have?", 32, hint="Including the wisdom teeth")
word(3, "history", "Who wrote the national anthem of India?", "Rabindranath Tagore", ["tagore", "rabindranath"], "He won the Nobel Prize in 1913")
mcq(3, "geography", "Which is the tallest mountain in the world?", ["Mount Everest", "K2", "Kangchenjunga", "Mount Kilimanjaro"])
word(3, "geography", "Which continent is the Sahara Desert in?", "Africa", hint="Egypt is there too")
num(3, "sports", "How many players from one team are on a basketball court?", 5, hint="Fewer than volleyball")
mcq(3, "science", "Which part of a plant makes food using sunlight?", ["Leaf", "Root", "Stem", "Flower"])
word(3, "gk", "Which language has the most native speakers in the world?", "Mandarin", ["chinese", "mandarin chinese"], "Spoken in Beijing")
num(3, "math", "How many degrees are in a right angle?", 90, hint="The corner of a square")
mcq(3, "history", "Who was the first woman Prime Minister of India?", ["Indira Gandhi", "Sarojini Naidu", "Pratibha Patil", "Sonia Gandhi"])
word(3, "geography", "In which country is the Eiffel Tower?", "France", hint="Its capital is Paris")
num(3, "math", "What is 25% of 200?", 50, hint="A quarter")
mcq(3, "science", "Which animal is the fastest on land?", ["Cheetah", "Lion", "Horse", "Kangaroo"])
word(3, "science", "What is the name of the galaxy we live in?", "Milky Way", ["the milky way", "milkyway"], "Also a chocolate bar")
mcq(3, "sports", "Which game has pieces called a rook and a bishop?", ["Chess", "Carrom", "Ludo", "Snakes and ladders"])
num(3, "gk", "How many years are in a decade?", 10, hint="Dec means ten")
mcq(3, "science", "What is the largest organ of the human body?", ["Skin", "Liver", "Heart", "Brain"])
word(3, "history", "Which Indian monument is famous as a symbol of love?", "Taj Mahal", ["tajmahal", "the taj", "taj"], "In Agra")
num(3, "science", "How many states of matter do we usually learn in school: solid, liquid and…?", 3, hint="Solid, liquid and one more")
mcq(3, "culture", "Which Indian festival is famous for throwing colours?", ["Holi", "Diwali", "Onam", "Pongal"])
word(3, "geography", "What is the capital of the United Kingdom?", "London", hint="Big Ben is there")
num(3, "math", "How many seconds are in 3 minutes?", 180, hint="3 × 60")
word(3, "riddle", "The more you take, the more you leave behind. What are they?", "footsteps", ["steps", "footprints", "foot steps"], "You make them when you walk")
word(3, "riddle", "What has many teeth but can't bite?", "comb", ["a comb"], "Used on your hair")
num(3, "riddle", "You have 3 apples and take away 2. How many apples do you have?", 2, hint="How many did YOU take?")
mcq(3, "meme", 'Finish the nerd joke: "There are 10 kinds of people: those who understand binary and…"', ["those who don't", "those who code", "those who sleep", "those who eat"])
word(3, "riddle", "What has a neck but no head?", "bottle", ["a bottle"], "You drink from it")
mcq(3, "meme", 'What does "LOL" usually mean in a chat?', ["Laughing out loud", "Lots of love", "Look online later", "Leave our lobby"])
num(3, "math", "A train leaves at 3 pm and the trip takes 2 hours. At what hour (pm) does it arrive?", 5, hint="3 + 2")
word(3, "riddle", "What word becomes shorter when you add two letters to it?", "short", hint="Look at the question itself")
mcq(3, "meme", 'What does "BRB" mean in a chat?', ["Be right back", "Bring real bread", "Big red button", "Bored, really bored"])
word(3, "riddle", "What can fill a room but takes up no space?", "light", ["the light"], "Switch it on")
mcq(3, "meme", 'Which game made "Winner winner chicken dinner" famous with players?', ["PUBG", "Minecraft", "Tetris", "Chess"])
num(3, "math", "What is the next number: 2, 4, 8, 16, …?", 32, hint="Each one doubles")
mcq(3, "meme", "Which famous puzzle is a cube with six coloured faces?", ["Rubik's Cube", "Sudoku", "Jenga", "Tangram"])

# ── Level 4 ─────────────────────────────────────────────────────────────────────────────────────────
num(4, "coding", "What does this print?\ndef f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(4))", 24, hint="4 × 3 × 2 × 1", code=PY)
mcq(4, "coding", "What does this print?\nx = [1, 2, 3]\ny = x\ny.append(4)\nprint(len(x))", ["4", "3", "Error", "0"], code=PY)
num(4, "coding", "What does this print?\nprint(sum(range(1, 6)))", 15, hint="1 + 2 + 3 + 4 + 5", code=PY)
mcq(4, "coding", "What does this print?\nprint([n * n for n in range(4)])", ["[0, 1, 4, 9]", "[1, 4, 9, 16]", "[0, 1, 2, 3]", "[1, 2, 3, 4]"], code=PY)
word(4, "coding", 'What does this print?\ns = "level"\nprint(s == s[::-1])', "True", hint="Is it the same backwards?", code=PY)
num(4, "coding", 'What does this print?\nd = {"a": 1, "b": 2}\nd["a"] = 5\nprint(d["a"] + d["b"])', 7, hint="a changed to 5", code=PY)
mcq(4, "coding", 'In JavaScript, what does this print?\nconsole.log("3" * "4")', ["12", "34", "NaN", "Error"], code=JS)
num(4, "coding", "Fix the bug: this should print 1 to 5 but stops at 4. What should the 5 become?\nfor i in range(1, 5):\n    print(i)", 6, hint="range stops before its end number")
num(4, "coding", "What does this print?\nx = 0\nfor i in range(3):\n    for j in range(2):\n        x += 1\nprint(x)", 6, hint="3 times 2", code=PY)
mcq(4, "coding", 'What does this print?\nprint("Hi" + str(5))', ["Hi5", "Hi 5", "Error", "5Hi"], code=PY)
word(4, "coding", 'What does this print?\nprint(sorted(["pear", "apple", "fig"])[0])', "apple", hint="Alphabetical order", code=PY)
num(4, "coding", "What does this print?\nprint(2 ** 10)", 1024, hint="Double 1 ten times", code=PY)
mcq(4, "coding", 'What does this print?\nprint("abc" * 0)', ["An empty line", "abc", "0", "Error"], code=(PY, EMPTY))
mcq(4, "tech", "How fast is binary search on a sorted list of n items?", ["O(log n)", "O(n)", "O(1)", "O(n²)"])
num(4, "tech", "Which port does HTTPS use by default?", 443, hint="Plain HTTP uses 80")
word(4, "tech", "A DNS server turns a website name into what?", "IP address", ["ip", "an ip address", "ip addresses"], "Numbers like 142.250.1.1")
mcq(4, "tech", "Which language runs natively inside web browsers?", ["JavaScript", "Python", "C++", "Java"])
mcq(4, "tech", 'Which data structure is "last in, first out"?', ["Stack", "Queue", "Linked list", "Hash map"])
word(4, "tech", "What is the name of the penguin mascot of Linux?", "Tux", hint="Sounds like tuxedo")
mcq(4, "tech", "Which of these is a NoSQL database?", ["MongoDB", "MySQL", "PostgreSQL", "Oracle Database"])
num(4, "tech", "What is the binary number 1111 in decimal?", 15, hint="8 + 4 + 2 + 1")
mcq(4, "tech", "In Git, which command saves your staged changes as a snapshot?", ["git commit", "git push", "git pull", "git clone"])
word(4, "tech", "What does CPU stand for?", "Central Processing Unit", ["central processor unit"], "The brain of the computer")
mcq(4, "tech", "Which shortcut takes a screenshot of the whole screen on Windows 10 and 11?", ["Windows + PrtScn", "Ctrl + S", "Alt + F4", "Ctrl + P"])
mcq(4, "history", "Who was the first person to walk on the Moon?", ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "Rakesh Sharma"])
num(4, "history", "In which year did World War II end?", 1945, hint="Two years before Indian independence")
word(4, "geography", "What is the capital of Canada?", "Ottawa", hint="Not Toronto!")
mcq(4, "science", "Which element has the chemical symbol Fe?", ["Iron", "Fluorine", "Lead", "Silver"])
word(4, "history", "Who is known as the Missile Man of India?", "APJ Abdul Kalam", ["kalam", "abdul kalam", "a p j abdul kalam", "a.p.j. abdul kalam", "apj kalam"], "He was President of India from 2002 to 2007")
num(4, "sports", "How many small squares are on a chess board?", 64, hint="8 × 8")
mcq(4, "geography", "Which is the largest hot desert in the world?", ["Sahara", "Thar", "Gobi", "Kalahari"])
word(4, "history", "Which Mughal emperor built the Taj Mahal?", "Shah Jahan", ["shahjahan"], "He built it for Mumtaz Mahal")
mcq(4, "science", "About how fast does light travel?", ["300,000 km per second", "3,000 km per second", "30 km per second", "3 km per second"])
num(4, "culture", "How many strings does a standard guitar have?", 6, hint="Half a dozen")
mcq(4, "geography", "Which country has the most people in the world?", ["India", "China", "United States", "Indonesia"])
num(4, "math", "What is the square root of 144?", 12, hint="? × ? = 144")
word(4, "science", "Which planet is often called the Morning Star?", "Venus", hint="Named after the goddess of love")
mcq(4, "history", "Who invented the telephone?", ["Alexander Graham Bell", "Thomas Edison", "Nikola Tesla", "Guglielmo Marconi"])
num(4, "sports", "How many players from one team are on the field in hockey?", 11, hint="Same as cricket and football")
word(4, "geography", "What is the capital of Germany?", "Berlin", hint="Once split by a wall")
mcq(4, "science", "What does a thermometer measure?", ["Temperature", "Pressure", "Speed", "Weight"])
num(4, "math", "How many zeros are in one lakh?", 5, hint="1,00,000")
word(4, "history", 'Who said "Give me blood, and I will give you freedom"?', "Subhas Chandra Bose", ["bose", "netaji", "subhash chandra bose", "subhas bose", "netaji subhas chandra bose"], "Known as Netaji")
mcq(4, "science", "Which gas makes up most of the air on Earth?", ["Nitrogen", "Oxygen", "Carbon dioxide", "Argon"])
word(4, "history", "Which scientist gave the three laws of motion?", "Isaac Newton", ["newton", "sir isaac newton"], "An apple fell near him")
num(4, "math", "How many minutes are in a day?", 1440, hint="24 × 60")
mcq(4, "geography", "Which Indian state is famous for backwaters and houseboats?", ["Kerala", "Goa", "Punjab", "Gujarat"])
word(4, "history", "In which country did chess begin, as chaturanga?", "India", hint="Closer than you think")
mcq(4, "science", "What is Jupiter's famous giant storm called?", ["The Great Red Spot", "The Big Blue Eye", "The Dark Ring", "The White Whirl"])
word(4, "riddle", "What can travel around the world while staying in a corner?", "stamp", ["a stamp", "postage stamp"], "Found on letters")
num(4, "riddle", "A farmer has 17 sheep. All but 9 run away. How many are left?", 9, hint='Read "all but 9" again')
mcq(4, "meme", '"Have you tried turning it off and on again?" is the famous line from which TV show?', ["The IT Crowd", "Friends", "Sherlock", "The Office"])
word(4, "riddle", "What has words but never speaks?", "book", ["a book"], "Libraries are full of them")
mcq(4, "meme", 'In a meme, what does "404: brain not found" mean?', ["Someone can't think right now", "A website is very fast", "The internet is free today", "A phone is brand new"])
num(4, "math", "What is the next number: 1, 1, 2, 3, 5, 8, …?", 13, hint="Add the two before it")
word(4, "riddle", "What has a ring but no finger?", "phone", ["a phone", "telephone", "bell", "a bell"], "It might be in your pocket")
mcq(4, "meme", 'Which dog breed stars in the "Doge" meme?', ["Shiba Inu", "Pug", "Labrador", "Husky"])
num(4, "riddle", "5 machines make 5 toys in 5 minutes. How many minutes do 100 machines take to make 100 toys?", 5, hint="Each machine makes one toy in 5 minutes")
word(4, "riddle", "What comes once in a minute, twice in a moment, but never in a thousand years?", "m", ["the letter m", "letter m"], "Look at the spelling")
word(4, "riddle", "I'm light as a feather, yet the strongest person can't hold me for five minutes. What am I?", "breath", ["your breath", "a breath"], "Inhale…")

# ── Level 5 ─────────────────────────────────────────────────────────────────────────────────────────
num(5, "coding", "What does this print?\ndef f(n):\n    return n if n < 2 else f(n - 1) + f(n - 2)\nprint(f(7))", 13, hint="Fibonacci: 0, 1, 1, 2, 3, 5, 8, …", code=PY)
mcq(5, "coding", "What does this print?\na = [1, 2, 3]\nb = a[:]\nb.append(4)\nprint(len(a), len(b))", ["3 4", "4 4", "3 3", "4 3"], code=PY)
num(5, "coding", "What does this print?\nx = 10\ndef change():\n    x = 5\nchange()\nprint(x)", 10, hint="The x inside the function is a different x", code=PY)
mcq(5, "coding", "What does this print?\nprint({1, 2, 2, 3})", ["{1, 2, 3}", "{1, 2, 2, 3}", "[1, 2, 3]", "Error"], code=PY)
num(5, "coding", 'What does this print?\nprint(len({"a": 1, "b": 2, "a": 3}))', 2, hint="A dictionary key can appear only once", code=PY)
word(5, "coding", 'What does this print?\nprint("Hello World".split()[1][::-1])', "dlroW", hint="Take the second word, then reverse it", code=PY)
mcq(5, "coding", "In JavaScript, what does this print?\nconsole.log(0.1 + 0.2 === 0.3)", ["false", "true", "undefined", "Error"], code=JS)
num(5, "coding", "What does this print?\nnums = [1, 2, 3, 4, 5, 6]\nprint(sum(n for n in nums if n % 3 == 0))", 9, hint="Only 3 and 6 count", code=PY)
mcq(5, "coding", "What does this print?\nprint(type([]) == type(()))", ["False", "True", "Error", "None"], code=PY)
num(5, "coding", "What does this print?\ns = 0\nfor i in range(10):\n    if i == 5:\n        break\n    s += i\nprint(s)", 10, hint="0 + 1 + 2 + 3 + 4", code=PY)
word(5, "coding", 'What does this print?\nprint("abc"[1:])', "bc", hint="Start from index 1", code=PY)
num(5, "coding", 'What does this print?\nprint(int("1010", 2))', 10, hint="Read 1010 as binary", code=PY)
mcq(5, "coding", "What does this print?\nprint([0] * 3)", ["[0, 0, 0]", "[0]", "[3]", "0003"], code=PY)
mcq(5, "coding", "Fix the bug: this crashes. Which line prints the last number instead?\nnums = [1, 2, 3]\nprint(nums[3])", ["print(nums[2])", "print(nums(3))", "print(nums{3})", "print(nums.3)"])
num(5, "coding", "What does this print?\nprint(len(str(2 ** 10)))", 4, hint="2 ** 10 is 1024", code=PY)
mcq(5, "tech", "What does an HTTP 500 error mean?", ["Something broke on the server", "The page was moved", "You are not logged in", "The page loaded fine"])
word(5, "tech", "What does API stand for?", "Application Programming Interface", ["application program interface"], "A is for Application")
mcq(5, "tech", "Which sorting method keeps swapping neighbouring items until the list is in order?", ["Bubble sort", "Merge sort", "Quick sort", "Heap sort"])
num(5, "tech", "How many layers does the OSI network model have?", 7, hint="Same as the days of the week")
mcq(5, "tech", "On average, how long does looking up a key in a hash map take?", ["O(1)", "O(n)", "O(log n)", "O(n log n)"])
word(5, "tech", "Which company first created the Java language?", "Sun Microsystems", ["sun", "sun micro systems"], "Named after a star")
mcq(5, "tech", "Which of these is NOT a standard HTTP method?", ["FETCH", "GET", "POST", "DELETE"])
num(5, "tech", "What is the hexadecimal number FF in decimal?", 255, hint="One less than 256")
word(5, "tech", "What do we call fake messages that trick you into giving away your password?", "phishing", ["phishing attack", "fishing"], "Sounds like catching fish")
mcq(5, "tech", 'What does "open source" software mean?', ["Its code is public for anyone to read and improve", "It never has bugs", "It only runs on Linux", "Nobody is allowed to change it"])
mcq(5, "science", "Who gave the theory of relativity?", ["Albert Einstein", "Isaac Newton", "Stephen Hawking", "Galileo Galilei"])
word(5, "geography", "What is the capital of Brazil?", "Brasilia", hint="Not Rio de Janeiro!")
num(5, "science", "How many hearts does an octopus have?", 3, hint="More than one, fewer than five")
mcq(5, "history", "Which Indian mathematician is linked to the famous number 1729?", ["Srinivasa Ramanujan", "Aryabhata", "Bhaskara", "Brahmagupta"])
num(5, "history", "In which year did the Constitution of India come into effect?", 1950, hint="26 January, a few years after independence")
mcq(5, "science", "Which planet spins tipped over on its side?", ["Uranus", "Venus", "Mars", "Neptune"])
word(5, "science", "Which metal is a liquid at room temperature?", "mercury", hint="Also the planet closest to the Sun")
num(5, "sports", "How many players from one team are on a volleyball court?", 6, hint="Half a dozen")
mcq(5, "geography", "Which is the smallest country in the world?", ["Vatican City", "Monaco", "Malta", "Maldives"])
word(5, "history", "In which city were the first modern Olympic Games held, in 1896?", "Athens", hint="Capital of Greece")
mcq(5, "history", "Who was the first Indian to win a Nobel Prize?", ["Rabindranath Tagore", "C. V. Raman", "Mother Teresa", "Amartya Sen"])
num(5, "science", "In which year did Chandrayaan-3 land on the Moon?", 2023, hint="Just a few years ago")
word(5, "geography", "Which is the largest country in the world by area?", "Russia", hint="It spans Europe and Asia")
mcq(5, "history", "Which of the Seven Wonders of the Ancient World still stands?", ["The Great Pyramid of Giza", "The Hanging Gardens of Babylon", "The Colossus of Rhodes", "The Lighthouse of Alexandria"])
num(5, "geography", "How many time zones does India officially use?", 1, hint="Think of IST")
word(5, "history", "Which Indian scientist won the Nobel Prize for the scattering of light?", "C V Raman", ["raman", "cv raman", "c.v. raman", "c. v. raman", "chandrasekhara venkata raman"], "The effect is named after him")
mcq(5, "science", 'Which part is called "the powerhouse of the cell"?', ["Mitochondria", "Nucleus", "Ribosome", "Cell wall"])
num(5, "math", "How many sides does a decagon have?", 10, hint="Like a decade")
word(5, "history", "Which famous ship sank in 1912 after hitting an iceberg?", "Titanic", ["the titanic", "rms titanic"], "A famous film too")
mcq(5, "science", "Which space agency launched Mangalyaan to Mars?", ["ISRO", "NASA", "DRDO", "ESA"])
num(5, "math", "What is 17 × 6?", 102, hint="17 × 5 is 85")
word(5, "science", "Which blood group is known as the universal donor?", "O negative", ["o-", "o neg", "onegative", "o -ve", "o-ve", "o negative blood"], "The letter O")
mcq(5, "history", "Which emperor gave up war after the Kalinga war?", ["Ashoka", "Akbar", "Chandragupta Maurya", "Harsha"])
word(5, "riddle", "Which word is spelled wrong in every dictionary?", "wrong", hint="Read the question again")
num(5, "riddle", "If two's company and three's a crowd, what are four and five?", 9, hint="Just add them")
word(5, "riddle", "I speak without a mouth and hear without ears. What am I?", "echo", ["an echo"], "Shout in a valley")
mcq(5, "riddle", "A bat and a ball cost ₹110 together. The bat costs ₹100 more than the ball. How much is the ball?", ["₹5", "₹10", "₹100", "₹1"])
num(5, "riddle", "A snail climbs 3 m up a 10 m well each day and slips back 2 m each night. On which day does it reach the top?", 8, hint="On the last day it doesn't slip back")
mcq(5, "meme", 'Which place completes the meme "One does not simply walk into…"?', ["Mordor", "Hogwarts", "Narnia", "Gotham"])
word(5, "riddle", "What is always in front of you but can't be seen?", "future", ["the future"], "Tomorrow is part of it")
mcq(5, "meme", 'In the "This is fine" meme, where is the dog sitting?', ["In a room on fire", "In a swimming pool", "In a spaceship", "In a traffic jam"])
num(5, "riddle", "How many times can you subtract 5 from 25?", 1, hint="After the first time, it isn't 25 any more")
word(5, "riddle", "What has cities but no houses, forests but no trees, and water but no fish?", "map", ["a map"], "Treasure hunters love one")


# ── Verify ──────────────────────────────────────────────────────────────────────────────────────────
def run(kind, source):
    cmd = [sys.executable, "-I", "-c", source] if kind == PY else ["node", "-e", source]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        raise SystemExit(f"code failed:\n{source}\n{r.stderr}")
    return r.stdout


def verify(q):
    d, cat, fmt, text, options, right, answer, alts, hint, code = q
    if not code:
        return
    kind, check = code if isinstance(code, tuple) else (code, "out")
    source = text.split("\n", 1)[1]
    out = run(kind, source)
    expected = options[right] if fmt == "mcq" else answer
    if check == LINES:
        got = str(len([l for l in out.splitlines() if l.strip()]))
    elif check == EMPTY:
        got, expected = ("ok" if out.strip() == "" else out), "ok"
    else:
        got = out.strip()
    if got != expected:
        raise SystemExit(f"WRONG ANSWER\n{text}\nexpected {expected!r}, the code printed {got!r}")


def main():
    problems = []
    seen = {}
    for q in Q:
        d, cat, fmt, text, options, right, answer, alts, hint, code = q
        key = " ".join(text.lower().split())
        if key in seen:
            problems.append(f"duplicate question: {text!r}")
        seen[key] = True
        if fmt != "mcq" and not hint:
            problems.append(f"typed question without a hint: {text!r}")
        if fmt == "mcq" and len({o.lower() for o in options}) < 4:
            problems.append(f"options repeat: {text!r}")
        verify(q)
    if problems:
        raise SystemExit("\n".join(problems))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\r\n")
        w.writerow(["difficulty", "format", "text", "answer", "alternatives", "option_a", "option_b", "option_c", "option_d", "hint", "category"])
        for i, (d, cat, fmt, text, options, right, answer, alts, hint, code) in enumerate(Q):
            if fmt == "mcq":
                # Put the right option in a different slot from row to row (players see their own shuffle anyway).
                k = i % 4
                rotated = options[right + 1 :] + options[: right + 1]  # right option is last
                rotated = rotated[-1:] + rotated[:-1]  # right option is first
                opts = rotated[-k:] + rotated[:-k] if k else rotated
                w.writerow([d, "mcq", text, LETTERS[opts.index(options[right])], "", *opts, "", cat])
            else:
                w.writerow([d, fmt, text, answer, " | ".join(alts), "", "", "", "", hint, cat])

    ran = sum(1 for q in Q if q[9])
    print(f"{len(Q)} questions, {ran} code answers checked by running them → {OUT.relative_to(ROOT)}")
    for d in range(1, 6):
        at = [q for q in Q if q[0] == d]
        fm = {f: sum(1 for q in at if q[2] == f) for f in ("mcq", "text", "number")}
        tech = sum(1 for q in at if q[1] in TECH)
        print(f"  level {d}: {len(at):3}  mcq {fm['mcq']:2} · word {fm['text']:2} · number {fm['number']:2}  |  technical {tech:2} · other {len(at) - tech:2}")


if __name__ == "__main__":
    main()
