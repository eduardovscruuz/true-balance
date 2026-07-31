import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(value: string): string {
    // Ignora tudo a partir do primeiro parêntese (ex: "Flash (VR)" -> "Flash" -> "F"),
    // já que parênteses geralmente qualificam o nome, não fazem parte dele.
    const withoutParenthetical = value.split('(')[0].trim();
    const source = withoutParenthetical || value;

    const words = source.trim().split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  }
}
