// ─────────────────────────────────────────────
// TRIVIA QUESTION POOL
// ─────────────────────────────────────────────
// Each entry has:
//   question — the question shown in the embed
//   options  — four short choices, except true/false entries which have two.
//              options[0] is ALWAYS the correct answer. The command shuffles
//              them before displaying, so players see a different order.
//   answer   — the correct answer string (must match options[0] exactly)
//
// Source: https://onepiece.fandom.com/wiki/One_Piece_Wiki:One_Piece_Quiz
// To add more questions, copy the format below and add to the array.
// keep the option choices short and concise, as the buttons have a character limit. Avoid using emojis in the options, as they may not render properly on all devices.

module.exports = [
  {
    question: 'How long did Portgas D. Rouge\'s pregnancy last?',
    options:  ['Twenty months', 'Ten months', 'Twelve months', 'Fifteen months'],
    answer:   'Twenty months'
  },
  {
    question: 'What is the bounty of "Rookie" Rockstar?',
    options:  ['94,000,000', '50,000,000', '120,000,000', '77,000,000'],
    answer:   '94,000,000'
  },
  {
    question: 'Which of the eleven Supernovas ate a Zoan Devil Fruit?',
    options:  ['X Drake', 'Killer', 'Basil Hawkins', 'Capone Bege'],
    answer:   'X Drake'
  },
  {
    question: 'Who is the only Shandia able to use Mantra?',
    options:  ['Aisa', 'Wyper', 'Raki', 'Genbo'],
    answer:   'Aisa'
  },
  {
    question: 'What is the highest position within the Marines?',
    options:  ['Fleet Admiral', 'Admiral', 'Vice Admiral', 'Commander-in-Chief'],
    answer:   'Fleet Admiral'
  },
  {
    question: 'How many "hells" exist in Impel Down?',
    options:  ['Six', 'Five', 'Seven', 'Four'],
    answer:   'Six'
  },
  {
    question: 'Who gave Shanks the scar on his eye?',
    options:  ['Marshall D. Teach', 'Kaido', 'Mihawk', 'Akainu'],
    answer:   'Marshall D. Teach'
  },
  {
    question: 'How old was Monkey D. Luffy before the timeskip?',
    options:  ['17', '19', '15', '18'],
    answer:   '17'
  },
  {
    question: 'Who wrote an article labelling Luffy a "Fifth Emperor"?',
    options:  ['Morgans', 'Koby', 'Sengoku', 'Garp'],
    answer:   'Morgans'
  },
  {
    question: 'Among Chaka, Igaram, and Pell — who did NOT eat a Devil Fruit?',
    options:  ['Igaram', 'Chaka', 'Pell', 'All three ate one'],
    answer:   'Igaram'
  },
  {
    question: 'How many routes start from Reverse Mountain?',
    options:  ['Seven', 'Five', 'Four', 'Eight'],
    answer:   'Seven'
  },
  {
    question: 'What was the name of the mayor of Luffy\'s hometown, Foosha Village?',
    options:  ['Woop Slap', 'Mayor Boodle', 'Curly Dadan', 'Tom'],
    answer:   'Woop Slap'
  },
  {
    question: 'Which seat of the Donquixote Pirates was intended for Trafalgar Law?',
    options:  ['The heart seat', 'The spade seat', 'The club seat', 'The diamond seat'],
    answer:   'The heart seat'
  },
  {
    question: 'Among Hatchan, Kaku, Onigumo, and Zoro — who uses the most swords?',
    options:  ['Onigumo', 'Hatchan', 'Zoro', 'Kaku'],
    answer:   'Onigumo'
  },
  {
    question: 'How much does Nami charge for seeing her naked?',
    options:  ['100,000', '50,000', '1,000,000', '200,000'],
    answer:   '100,000'
  },
  {
    question: 'What mythological animal does Pierre (in hybrid form) resemble?',
    options:  ['Pegasus', 'Unicorn', 'Griffin', 'Centaur'],
    answer:   'Pegasus'
  },
  {
    question: 'Who was the second Warlord of the Sea to have their name mentioned in the story?',
    options:  ['Jinbe', 'Crocodile', 'Doflamingo', 'Mihawk'],
    answer:   'Jinbe'
  },
  {
    question: 'What does the name "Kuja" mean?',
    options:  ['Nine snakes', 'Sea warriors', 'Flower island', 'Warrior tribe'],
    answer:   'Nine snakes'
  },
  {
    question: 'What do Zoro, Laffitte, Shiryu, CP9, X Drake, and Gasparde have in common?',
    options:  ['Former anti-pirates', 'Former kings', 'Sky Island natives', 'Revolutionary leaders'],
    answer:   'Former anti-pirates'
  },
  {
    question: 'What do Nami\'s tattoo symbols represent, who do they honor, and what did they replace?',
    options:  ['Mikan/pinwheel; Bell-mère/Genzo; Jolly Roger', 'Sun/moon; Nami/Nojiko; tattoo', 'Orange/bell; Arlong/Shanks; scar', 'Stars/cross; Luffy/Zoro; bracelet'],
    answer:   'Mikan/pinwheel; Bell-mère/Genzo; Jolly Roger'
  },
  {
    question: 'Who battled three of Enel\'s priests?',
    options:  ['Chopper', 'Usopp', 'Sanji', 'Nami'],
    answer:   'Chopper'
  },
  {
    question: 'In the Boss Luffy episode, who does Zoro break in on, and who chases him out?',
    options:  ['Terracotta/Amazon/Maria; Monday', 'Nami/Robin/Nojiko; Zoro', 'Sanji/Usopp/Chopper; Luffy', 'Tashigi/Kuina/Hiyori; Genzo'],
    answer:   'Terracotta/Amazon/Maria; Monday'
  },
  {
    question: 'Which Baroque Works agent had a frog theme?',
    options:  ['Miss Father\'s Day', 'Mr. 5', 'Miss Goldenweek', 'Mr. 4'],
    answer:   'Miss Father\'s Day'
  },
  {
    question: 'Who gave Nami paper for her world map?',
    options:  ['Rice Rice', 'Woop Slap', 'Banban', 'Tom'],
    answer:   'Rice Rice'
  },
  {
    question: 'Why did Noland cut down Shandora\'s sacred trees?',
    options:  ['They spread a plague', 'They hid gold', 'They blocked the sea', 'They were cursed'],
    answer:   'They spread a plague'
  },
  {
    question: 'What did Zoro cut in the Warship Island filler arc?',
    options:  ['Steel chains', 'Sea stone', 'A cannon', 'A mast'],
    answer:   'Steel chains'
  },
  {
    question: 'Who were the first Zoan and Logia users shown?',
    options:  ['Dalton and Smoker', 'Chopper and Ace', 'Pell and Crocodile', 'Lucci and Enel'],
    answer:   'Dalton and Smoker'
  },
  {
    question: 'True or False: Jaguar D. Saul was born in Elbaf.',
    options:  ['True', 'False'],
    answer:   'False'
  },
  {
    question: 'Which Supernova had a higher bounty than Luffy, and why?',
    options:  ['Kid; attacked civilians', 'Law; defeated Marines', 'Hawkins; used divination', 'Apoo; joined Kaido'],
    answer:   'Kid; attacked civilians'
  },
  {
    question: 'Which Straw Hat was first seen in the anime?',
    options:  ['Nami', 'Luffy', 'Zoro', 'Shanks'],
    answer:   'Nami'
  },
  {
    question: 'Against whom did Luffy use Gear Second and Third together?',
    options:  ['Gecko Moria', 'Rob Lucci', 'Doflamingo', 'Kaido'],
    answer:   'Gecko Moria'
  },
  {
    question: 'Who first witnessed Luffy use Gear Third?',
    options:  ['Chimney and Gonbe', 'Nami and Usopp', 'Robin and Franky', 'Momo and Kinemon'],
    answer:   'Chimney and Gonbe'
  },
  {
    question: 'What was Ace\'s goal in life?',
    options:  ['Know if he deserved birth', 'Become Pirate King', 'Find One Piece', 'Defeat Blackbeard'],
    answer:   'Know if he deserved birth'
  },
  {
    question: 'Who was the first person Luffy fought, and why?',
    options:  ['Higuma; insulted Shanks', 'Alvida; stole his hat', 'Koby; challenged him', 'Shanks; took his food'],
    answer:   'Higuma; insulted Shanks'
  },
  {
    question: 'Why was Sanji\'s first bounty photo completely black?',
    options:  ['The lens cap was on', 'It was censored', 'The film was damaged', 'It was a drawing'],
    answer:   'The lens cap was on'
  },
  {
    question: 'When does Zoro cry, and what links both events?',
    options:  ['Kuina/Mihawk; both defeats', 'Luffy/Sanji; both rescues', 'Shanks/Mihawk; both wins', 'Tashigi/Hiyori; both promises'],
    answer:   'Kuina/Mihawk; both defeats'
  },
  {
    question: 'Why is Nami\'s bounty photo inappropriate, and who says so?',
    options:  ['Photo mix-up; Genzo', 'Bad pose; Nojiko', 'Fake photo; Robin', 'Censored photo; Garp'],
    answer:   'Photo mix-up; Genzo'
  },
  {
    question: 'What food is Garp extremely fond of?',
    options:  ['Doughnuts', 'Crackers', 'Rice balls', 'Meat'],
    answer:   'Doughnuts'
  },
  {
    question: 'Name four of Chopper\'s forms.',
    options:  ['Arm, Brain, Guard, Heavy', 'Horn, Walk, Fish, Flame', 'Monster, Sky, Dark, Ice', 'Jump, Sword, Fish, Wolf'],
    answer:   'Arm, Brain, Guard, Heavy'
  },
  {
    question: 'Why did Lucci kick Nero off, and what did he yell?',
    options:  ['Attacked Franky; master six forms', 'Stole money; run faster', 'Insulted Robin; stay quiet', 'Failed a mission; try again'],
    answer:   'Attacked Franky; master six forms'
  },
  {
    question: 'Which Donquixote Pirates seat was intended for Law?',
    options:  ['Heart seat', 'Spade seat', 'Club seat', 'Diamond seat'],
    answer:   'Heart seat'
  },
  {
    question: 'True or False: Luffy defeats Demaro Black in Sabaody.',
    options:  ['True', 'False'],
    answer:   'False'
  },
  {
    question: 'Who gave Shanks the scar over his eye?',
    options:  ['Blackbeard', 'Kaido', 'Mihawk', 'Akainu'],
    answer:   'Blackbeard'
  },
  {
    question: 'How many hells exist in Impel Down?',
    options:  ['Six', 'Five', 'Seven', 'Eight'],
    answer:   'Six'
  },
  {
    question: 'What makes non-canon Logia fruits different?',
    options:  ['They lack destruction', 'They lack powers', 'They are artificial', 'They need Haki'],
    answer:   'They lack destruction'
  },
  {
    question: 'Which Baroque Works agents both fight with baseball bats?',
    options:  ['Mr. 4 and Mr. 9', 'Mr. 1 and Mr. 2', 'Miss Doublefinger and Mr. 3', 'Mr. 5 and Mr. 7'],
    answer:   'Mr. 4 and Mr. 9'
  },
  {
    question: 'Which Straw Hat\'s loved one was shot through the chest?',
    options:  ['Bell-mère', 'Kuina', 'Toko', 'Clover'],
    answer:   'Bell-mère'
  },
  {
    question: 'Who did Yasopp defeat in a duel before that person beat Usopp?',
    options:  ['Daddy "The Father"', 'Van Augur', 'Lucky Roux', 'Duval'],
    answer:   'Daddy "The Father"'
  },
  {
    question: 'Are any Supernovas from outside the four Blues?',
    options:  ['Yes: Apoo and Urouge', 'No, none', 'Yes: Law and Kid', 'Yes: Zoro and Killer'],
    answer:   'Yes: Apoo and Urouge'
  },
  {
    question: 'How old was Luffy before the timeskip?',
    options:  ['17', '19', '15', '21'],
    answer:   '17'
  },
  {
    question: 'Who uses the most swords: Hatchan, Kaku, Onigumo, or Zoro?',
    options:  ['Onigumo: eight', 'Hatchan: six', 'Kaku: four', 'Zoro: three'],
    answer:   'Onigumo: eight'
  },
  {
    question: 'What was the name of the man who gave Sanji salt in Water 7?',
    options:  ['Banban', 'Rice Rice', 'Nero', 'Iceburg'],
    answer:   'Banban'
  },
  {
    question: 'What was the name of Brook\'s former crew?',
    options:  ['Rumbar Pirates', 'Roger Pirates', 'Drum Pirates', 'Rocks Pirates'],
    answer:   'Rumbar Pirates'
  },
  {
    question: 'Which Devil Fruit did Blackbeard kill Thatch for?',
    options:  ['Yami Yami no Mi', 'Gura Gura no Mi', 'Mera Mera no Mi', 'Ope Ope no Mi'],
    answer:   'Yami Yami no Mi'
  },
  {
    question: 'What shape was Jaya Island before it split?',
    options:  ['A skull', 'A crescent', 'A heart', 'A star'],
    answer:   'A skull'
  },
  {
    question: 'What was the first Sea King or sea monster shown?',
    options:  ['Lord of the Coast', 'Sea Beast', 'Kraken', 'Neptune'],
    answer:   'Lord of the Coast'
  },
  {
    question: 'What was the prize of Doflamingo\'s Dressrosa tournament?',
    options:  ['Mera Mera no Mi', 'Gomu Gomu no Mi', 'Ope Ope no Mi', 'Hito Hito no Mi'],
    answer:   'Mera Mera no Mi'
  },
  {
    question: 'Which Supernova became a Warlord of the Sea?',
    options:  ['Trafalgar Law', 'Eustass Kid', 'X Drake', 'Urouge'],
    answer:   'Trafalgar Law'
  },
  {
    question: 'What are the Yeti Cool Brothers named?',
    options:  ['Rock and Scotch', 'Kaku and Jabra', 'Daz and Bon', 'Saru and Inu'],
    answer:   'Rock and Scotch'
  },
  {
    question: 'According to Pell, how many Devil Fruits allow flight?',
    options:  ['Five', 'Three', 'Seven', 'Ten'],
    answer:   'Five'
  },
  {
    question: 'How old was Ace when he first met Luffy?',
    options:  ['Ten', 'Five', 'Twelve', 'Seventeen'],
    answer:   'Ten'
  },
  {
    question: 'What happens if someone eats a second Devil Fruit?',
    options:  ['They die', 'They get stronger', 'They lose memory', 'They become a giant'],
    answer:   'They die'
  },
  {
    question: 'What are the names of Señor Pink\'s deceased wife and son?',
    options:  ['Russian and Gimlet', 'Cora and Law', 'Belle and Tom', 'Nojiko and Genzo'],
    answer:   'Russian and Gimlet'
  },
  {
    question: 'Which Revolutionary Army members appear in Dressrosa?',
    options:  ['Sabo, Hack, Karasu, Koala', 'Dragon, Ivankov, Kuma, Sabo', 'Koala, Robin, Hack, Luffy', 'Sabo, Ace, Hack, Dragon'],
    answer:   'Sabo, Hack, Karasu, Koala'
  },
];
