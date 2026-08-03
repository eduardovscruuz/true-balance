import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { MonthSelectionService } from './core/services/month-selection.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly monthSelection = inject(MonthSelectionService);

  // Menu "+" do header — mesmas 3 ações dos botões grandes do Dashboard, só que
  // acessível de qualquer tela.
  protected readonly newMenuOpen = signal(false);

  toggleNewMenu(): void {
    this.newMenuOpen.update((open) => !open);
  }

  closeNewMenu(): void {
    this.newMenuOpen.set(false);
  }
}
