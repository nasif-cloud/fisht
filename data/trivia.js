// ─────────────────────────────────────────────
// TRIVIA QUESTION POOL
// ─────────────────────────────────────────────
// Each entry has:
//   question — the question shown in the embed
//   options  — exactly 4 choices; options[0] is ALWAYS the correct answer.
//              The command shuffles them before displaying, so players see
//              a different button order each time.
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
    answer:   'Onigumo (eight swords)'
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
];
