// Discord allows at most 25 autocomplete suggestions at once.
const MAX_AUTOCOMPLETE_RESULTS = 25;

/**
 * Build card-name suggestions for a card query field.
 *
 * Suggestions are matched against both the card name and its aliases.
 * The full card name is returned as the selected value so commands can
 * continue using their existing card lookup logic.
 */
function getCardAutocompleteChoices(cards, focusedValue) {
  const search = (focusedValue || '').trim().toLowerCase();

  return cards
    .filter(card => {
      if (!card.name) return false;
      if (!search) return true;

      return card.name.toLowerCase().includes(search) ||
        (card.aliases || []).some(alias =>
          alias && alias.toLowerCase().includes(search)
        );
    })
    .slice(0, MAX_AUTOCOMPLETE_RESULTS)
    .map(card => ({
      name: card.name.slice(0, 100),
      value: card.name.slice(0, 100)
    }));
}

module.exports = { getCardAutocompleteChoices };