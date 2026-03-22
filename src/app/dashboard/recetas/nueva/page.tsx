
import { getIngredientOptionsAction } from '@/app/actions/recipe.actions';
import RecipeForm from './RecipeForm';

export const dynamic = 'force-dynamic';

export default async function NewRecipePage() {
    const ingredientOptions = await getIngredientOptionsAction();

    return (
        <RecipeForm availableIngredients={ingredientOptions} />
    );
}
