import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

const SUFFIX = 'Wayel Kids';

@Injectable({ providedIn: 'root' })
export class WayelTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const t = this.buildTitle(snapshot);
    this.title.setTitle(t ? `${t} · ${SUFFIX}` : SUFFIX);
  }
}
