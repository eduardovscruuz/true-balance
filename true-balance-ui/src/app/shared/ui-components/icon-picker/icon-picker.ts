import { Component, ElementRef, HostListener, computed, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

import { ALL_LUCIDE_ICON_NAMES, CURATED_ICON_NAMES } from '../../utils/lucide-icon.util';

const MAX_SEARCH_RESULTS = 60;

@Component({
  selector: 'app-icon-picker',
  imports: [LucideAngularModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IconPicker),
      multi: true,
    },
  ],
  templateUrl: './icon-picker.html',
  styleUrl: './icon-picker.scss',
})
export class IconPicker implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly value = signal('');
  readonly isOpen = signal(false);
  readonly searchTerm = signal('');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  readonly visibleIcons = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();

    if (!term) {
      return CURATED_ICON_NAMES;
    }

    return ALL_LUCIDE_ICON_NAMES.filter((name) => name.includes(term)).slice(0, MAX_SEARCH_RESULTS);
  });

  toggle(): void {
    if (this.disabled()) {
      return;
    }

    this.isOpen.update((open) => !open);
  }

  selectIcon(name: string): void {
    this.value.set(name);
    this.onChange(name);
    this.onTouched();
    this.isOpen.set(false);
    this.searchTerm.set('');
  }

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
