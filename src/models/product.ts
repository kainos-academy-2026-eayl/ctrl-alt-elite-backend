export class Product {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly imageUrl: string;
  public readonly unitPricePence: number;
  public readonly keywords: readonly string[];
  public readonly isInStock: boolean;

  constructor(details: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    unitPricePence: number;
    keywords: readonly string[];
    isInStock: boolean;
  }) {
    if (details.id.trim() === '') {
      throw new Error('A product must have an id.');
    }
    if (details.name.trim() === '') {
      throw new Error('A product must have a name.');
    }
    if (
      !Number.isInteger(details.unitPricePence) ||
      details.unitPricePence < 0
    ) {
      throw new Error('Unit price must be a whole number of pence, 0 or more.');
    }

    this.id = details.id;
    this.name = details.name;
    this.description = details.description;
    this.imageUrl = details.imageUrl;
    this.unitPricePence = details.unitPricePence;
    this.keywords = details.keywords;
    this.isInStock = details.isInStock;
  }

  /** Price in pounds as a 2 decimal place string, e.g. "24.99", as the frontend shows it. */
  get price(): string {
    const pounds = Math.floor(this.unitPricePence / 100);
    const pence = String(this.unitPricePence % 100).padStart(2, '0');
    return `${pounds}.${pence}`;
  }
}
