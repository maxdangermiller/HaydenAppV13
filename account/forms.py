from django.contrib.auth.forms import UserCreationForm, UserChangeForm

from .models import Account


class CustomUserCreationForm(UserCreationForm):

    class Meta(UserCreationForm):
        model = Account
        fields = ('username',)


class CustomUserChangeForm(UserChangeForm):

    class Meta:
        model = Account
        fields = ('username',)
