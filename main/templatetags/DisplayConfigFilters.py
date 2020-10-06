from django import template
from main.models import DisplayConfig

register = template.Library()


def configEdit(configVal, display_id):
    configVal2 = DisplayConfig.objects.get(id=1)
    if display_id == "1":
        output = configVal2.display_one_name
    elif display_id == "2":
        output = configVal2.display_two_name
    elif display_id == "3":
        output = configVal2.display_three_name
    elif display_id == "4":
        output = configVal2.display_four_name
    elif display_id == "5":
        output = configVal2.display_five_name
    elif display_id == "6":
        output = configVal2.display_six_name
    else:
        output = ""
    return output


register.filter('configEdit', configEdit)
