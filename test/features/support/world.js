import { setWorldConstructor, World } from '@cucumber/cucumber';

class BoardWorld extends World {
  constructor(options) {
    super(options);
    this.page = null;
    this.consoleErrors = [];
    this.snapshotDataUrl = null;
    this.previousGrid = null;
  }
}

setWorldConstructor(BoardWorld);
