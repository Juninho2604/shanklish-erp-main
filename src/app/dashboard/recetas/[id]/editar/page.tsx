import { notFound } from 'next/navigation';
import RecipeForm from '../../nueva/RecipeForm';
import { getIngredientOptionsAction, getRecipeByIdAction } from '@/app/actions/recipe.actions';

export default async function EditRecipePage({ params }: { params: { id: string } }) {
    const [recipe, ingredients] = await Promise.all([
        getRecipeByIdAction(params.id),
        getIngredientOptionsAction()
    ]);

    if (!recipe) {
        notFound();
    }

    return <RecipeForm availableIngredients={ingredients} initialData={recipe} />;
}
