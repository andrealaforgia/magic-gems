import { When } from '@cucumber/cucumber';
import { findHighlight } from './interaction.steps.js';
import { moveCursorTo, directionKey } from './game.steps.js';

When('I commit that swap, pressing SPACE redundantly a few times right after selecting', async function () {
  const { a, b } = this.foundSwap;
  const [cursor] = await findHighlight(this.page, 'cursor');

  await moveCursorTo(this.page, cursor, a);
  await this.page.keyboard.press(' ');
  await this.page.keyboard.press(' ');
  await this.page.keyboard.press(' ');
  await this.page.keyboard.press(' ');
  await this.page.keyboard.press(directionKey(a, b));
  await this.page.keyboard.press(' ');
});
